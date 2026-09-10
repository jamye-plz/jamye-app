import type { AccountPrincipal } from "@/core/database/account/types";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedChatRepository,
  ConnectedClaimedOutboxCommand,
  ConnectedSendErrorCode,
} from "@/core/database/account/connected-chat-types";

export type OutboxDispatcherRepository = Pick<
  ConnectedChatRepository,
  | "claimDueOutboxCommands"
  | "failClaimedOutboxCommand"
  | "mergeCanonicalMessage"
  | "releaseOutboxClaims"
  | "rescheduleClaimedOutboxCommand"
>;

export type OutboxDispatcherPrincipal = Pick<AccountPrincipal, "userId">;

export type OutboxSendFailureKind =
  | "network"
  | "timeout"
  | "rate_limited"
  | "server_error"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "unauthorized"
  | "upgrade_required";

export type OutboxSendFailure = Readonly<{
  kind: OutboxSendFailureKind;
  retryAfterMs?: number;
}>;

export type OutboxPauseReason = "unauthorized" | "upgrade-required";

export type OutboxDispatcher = Readonly<{
  dispose: () => void;
  pause: () => void;
  resume: () => void;
  start: () => void;
  wake: () => void;
}>;

export type CreateOutboxDispatcherOptions = Readonly<{
  createLeaseToken: () => string;
  isActive: () => boolean;
  nowMs: () => number;
  onChanged?: () => void;
  onPaused?: (reason: OutboxPauseReason) => void;
  principal: OutboxDispatcherPrincipal;
  random: () => number;
  repository: OutboxDispatcherRepository;
  send: (
    command: ConnectedClaimedOutboxCommand,
    signal: AbortSignal,
  ) => Promise<ConnectedCanonicalMessageUpsert>;
}>;

const CLAIM_BATCH_LIMIT = 1;
const LEASE_DURATION_MS = 45_000;
const SEND_DEADLINE_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_SAFE_DUE_AT_MS = Number.MAX_SAFE_INTEGER;

const SEND_FAILURE_KINDS: ReadonlySet<OutboxSendFailureKind> = new Set([
  "network",
  "timeout",
  "rate_limited",
  "server_error",
  "forbidden",
  "not_found",
  "conflict",
  "validation",
  "unauthorized",
  "upgrade_required",
]);

function asOutboxSendFailure(error: unknown): OutboxSendFailure | null {
  if (typeof error !== "object" || error === null || !("kind" in error))
    return null;
  const { kind } = error as { kind: unknown };
  if (typeof kind !== "string") return null;
  if (!SEND_FAILURE_KINDS.has(kind as OutboxSendFailureKind)) return null;
  const { retryAfterMs } = error as { retryAfterMs?: unknown };
  if (retryAfterMs !== undefined && typeof retryAfterMs !== "number")
    return null;
  return {
    kind: kind as OutboxSendFailureKind,
    retryAfterMs:
      typeof retryAfterMs === "number" &&
      Number.isFinite(retryAfterMs) &&
      retryAfterMs >= 0
        ? retryAfterMs
        : undefined,
  };
}

type SendClassification =
  | Readonly<{
      bucket: "retry";
      errorCode: ConnectedSendErrorCode;
      retryAfterMs?: number;
    }>
  | Readonly<{ bucket: "terminal"; errorCode: ConnectedSendErrorCode }>
  | Readonly<{ bucket: "pause"; reason: OutboxPauseReason }>;

function classifySendFailure(error: unknown): SendClassification {
  const failure = asOutboxSendFailure(error);
  if (!failure) return { bucket: "retry", errorCode: "unknown" };
  switch (failure.kind) {
    case "network":
    case "timeout":
      return {
        bucket: "retry",
        errorCode: "network",
        retryAfterMs: failure.retryAfterMs,
      };
    case "rate_limited":
    case "server_error":
      return {
        bucket: "retry",
        errorCode: "server_unavailable",
        retryAfterMs: failure.retryAfterMs,
      };
    case "forbidden":
    case "not_found":
      return { bucket: "terminal", errorCode: "forbidden" };
    case "conflict":
      return { bucket: "terminal", errorCode: "conflict" };
    case "validation":
      return { bucket: "terminal", errorCode: "validation" };
    case "unauthorized":
      return { bucket: "pause", reason: "unauthorized" };
    case "upgrade_required":
      return { bucket: "pause", reason: "upgrade-required" };
  }
}

function computeDelayMs(
  attemptCount: number,
  classification: Extract<SendClassification, { bucket: "retry" }>,
  random: () => number,
): number {
  if (
    typeof classification.retryAfterMs === "number" &&
    Number.isFinite(classification.retryAfterMs) &&
    classification.retryAfterMs >= 0
  ) {
    return classification.retryAfterMs;
  }
  const exponent = Math.max(0, attemptCount - 1);
  const base = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** exponent);
  return Math.round(base * (0.5 + random() * 0.5));
}

function dueAtMs(nowMs: number, delayMs: number): number {
  const dueAtMs = nowMs + delayMs;
  if (!Number.isFinite(dueAtMs) || dueAtMs > MAX_SAFE_DUE_AT_MS)
    return MAX_SAFE_DUE_AT_MS;
  return dueAtMs;
}

function identityMatches(
  command: ConnectedClaimedOutboxCommand,
  result: ConnectedCanonicalMessageUpsert,
  userId: string,
): boolean {
  return (
    result.chatroomId === command.chatroomId &&
    result.clientMsgId === command.clientMsgId &&
    result.senderId === userId
  );
}

type SendAttempt =
  | Readonly<{
      kind: "result";
      result: ConnectedCanonicalMessageUpsert;
    }>
  | Readonly<{ kind: "error"; error: unknown }>
  | Readonly<{ kind: "aborted" }>
  | Readonly<{ kind: "timed_out" }>;

export function createOutboxDispatcher({
  createLeaseToken,
  isActive,
  nowMs,
  onChanged,
  onPaused,
  principal,
  random,
  repository,
  send,
}: CreateOutboxDispatcherOptions): OutboxDispatcher {
  let disposed = false;
  let manuallyPaused = false;
  let autoPauseReason: OutboxPauseReason | null = null;
  let lifecycleEpoch = 0;
  let cycleInFlight = false;
  let wakeRequested = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentAbort: AbortController | null = null;
  let currentLeaseToken: string | null = null;

  const isPaused = () => manuallyPaused || autoPauseReason !== null;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function scheduleNext(delayMs: number) {
    if (disposed || isPaused()) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void runCycle();
    }, delayMs);
  }

  function finishCycle(idleDelayMs: number) {
    if (disposed || isPaused()) return;
    if (wakeRequested) {
      wakeRequested = false;
      void runCycle();
      return;
    }
    scheduleNext(idleDelayMs);
  }

  async function releaseLease(leaseToken: string) {
    if (!isActive()) return;
    try {
      await repository.releaseOutboxClaims({
        leaseToken,
        nextAttemptAtMs: nowMs(),
      });
    } catch {
      // Best-effort: an expired lease is the crash/teardown fallback.
    }
  }

  function isCurrentCycle(epoch: number): boolean {
    return (
      !disposed &&
      !manuallyPaused &&
      autoPauseReason === null &&
      lifecycleEpoch === epoch &&
      isActive()
    );
  }

  function sendUntilSettled(
    command: ConnectedClaimedOutboxCommand,
    abort: AbortController,
  ): Promise<SendAttempt> {
    return new Promise((resolve) => {
      let settled = false;
      let timedOut = false;
      const settle = (attempt: SendAttempt) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadlineTimer);
        abort.signal.removeEventListener("abort", handleAbort);
        resolve(attempt);
      };
      const handleAbort = () =>
        settle({ kind: timedOut ? "timed_out" : "aborted" });
      const deadlineTimer = setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, SEND_DEADLINE_MS);

      abort.signal.addEventListener("abort", handleAbort, { once: true });
      if (abort.signal.aborted) {
        handleAbort();
        return;
      }

      void (async () => {
        try {
          const result = await send(command, abort.signal);
          settle(
            abort.signal.aborted
              ? { kind: timedOut ? "timed_out" : "aborted" }
              : { kind: "result", result },
          );
        } catch (error) {
          settle(
            abort.signal.aborted
              ? { kind: timedOut ? "timed_out" : "aborted" }
              : { kind: "error", error },
          );
        }
      })();
    });
  }

  function reportChanged() {
    try {
      onChanged?.();
    } catch {
      // A consumer notification must not strand the dispatch loop.
    }
  }

  function reportPaused(reason: OutboxPauseReason) {
    try {
      onPaused?.(reason);
    } catch {
      // A consumer notification must not strand the dispatch loop.
    }
  }

  async function runCycle() {
    if (disposed || isPaused() || cycleInFlight) return;
    cycleInFlight = true;
    const epoch = lifecycleEpoch;
    let leaseToken: string | null = null;
    let claimed: readonly ConnectedClaimedOutboxCommand[] = [];
    let pauseReason: OutboxPauseReason | null = null;
    let releaseClaim = false;
    let notifyChanged = false;
    let requestFollowUp = false;

    try {
      if (!isCurrentCycle(epoch)) return;

      leaseToken = createLeaseToken();
      currentLeaseToken = leaseToken;
      try {
        const claimedAtMs = nowMs();
        claimed = await repository.claimDueOutboxCommands({
          leaseExpiresAtMs: dueAtMs(claimedAtMs, LEASE_DURATION_MS),
          leaseToken,
          limit: CLAIM_BATCH_LIMIT,
          nowMs: claimedAtMs,
        });
      } catch {
        return;
      }

      if (!isCurrentCycle(epoch)) {
        releaseClaim = true;
        return;
      }
      if (claimed.length === 0) return;

      for (const command of claimed) {
        if (!isCurrentCycle(epoch) || nowMs() >= command.leaseExpiresAtMs) {
          releaseClaim = true;
          break;
        }

        const abort = new AbortController();
        currentAbort = abort;
        const attempt = await sendUntilSettled(command, abort);
        if (currentAbort === abort) currentAbort = null;

        if (
          !isCurrentCycle(epoch) ||
          nowMs() >= command.leaseExpiresAtMs ||
          attempt.kind === "aborted"
        ) {
          releaseClaim = true;
          break;
        }

        if (attempt.kind === "result") {
          try {
            if (identityMatches(command, attempt.result, principal.userId)) {
              await repository.mergeCanonicalMessage(attempt.result);
            } else {
              await repository.failClaimedOutboxCommand({
                commandId: command.commandId,
                errorCode: "unknown",
                leaseToken,
              });
            }
            requestFollowUp = true;
          } catch {
            releaseClaim = true;
            break;
          }
          continue;
        }

        const classification = classifySendFailure(
          attempt.kind === "timed_out" ? { kind: "timeout" } : attempt.error,
        );
        if (classification.bucket === "pause") {
          pauseReason = classification.reason;
          releaseClaim = true;
          break;
        }
        try {
          if (classification.bucket === "terminal") {
            await repository.failClaimedOutboxCommand({
              commandId: command.commandId,
              errorCode: classification.errorCode,
              leaseToken,
            });
          } else {
            const delayMs = computeDelayMs(
              command.attemptCount,
              classification,
              random,
            );
            await repository.rescheduleClaimedOutboxCommand({
              commandId: command.commandId,
              errorCode: classification.errorCode,
              leaseToken,
              nextAttemptAtMs: dueAtMs(nowMs(), delayMs),
            });
          }
          requestFollowUp = true;
        } catch {
          releaseClaim = true;
          break;
        }
      }

      notifyChanged = isCurrentCycle(epoch);
    } catch {
      releaseClaim = true;
    } finally {
      if (currentLeaseToken === leaseToken) currentLeaseToken = null;
      const cycleStillCurrent = isCurrentCycle(epoch);
      if (
        leaseToken !== null &&
        (releaseClaim || !cycleStillCurrent || pauseReason !== null)
      ) {
        await releaseLease(leaseToken);
      }

      cycleInFlight = false;
      if (disposed) return;
      if (pauseReason && cycleStillCurrent) {
        autoPauseReason = pauseReason;
        reportPaused(pauseReason);
        return;
      }
      if (notifyChanged && isCurrentCycle(epoch)) reportChanged();
      finishCycle(requestFollowUp ? 0 : POLL_INTERVAL_MS);
    }
  }

  return {
    start() {
      if (disposed || isPaused() || cycleInFlight || timer !== null) return;
      void runCycle();
    },
    wake() {
      if (disposed || isPaused()) return;
      if (cycleInFlight) {
        wakeRequested = true;
        return;
      }
      clearTimer();
      void runCycle();
    },
    pause() {
      if (disposed) return;
      manuallyPaused = true;
      lifecycleEpoch += 1;
      clearTimer();
      currentAbort?.abort();
      currentAbort = null;
      if (currentLeaseToken !== null) void releaseLease(currentLeaseToken);
    },
    resume() {
      if (disposed) return;
      manuallyPaused = false;
      autoPauseReason = null;
      if (cycleInFlight) {
        wakeRequested = true;
        return;
      }
      clearTimer();
      void runCycle();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycleEpoch += 1;
      clearTimer();
      currentAbort?.abort();
      currentAbort = null;
      if (currentLeaseToken !== null) void releaseLease(currentLeaseToken);
    },
  };
}
