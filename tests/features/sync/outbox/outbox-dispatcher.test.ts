import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedClaimedOutboxCommand,
  ConnectedSendErrorCode,
} from "@/core/database/account/connected-chat-types";
import {
  createOutboxDispatcher,
  type OutboxDispatcherRepository,
  type OutboxPauseReason,
  type OutboxSendFailure,
} from "@/features/sync/outbox/outbox-dispatcher";

const USER_ID = "user-1";

function claimedCommand(
  overrides: Partial<ConnectedClaimedOutboxCommand> = {},
): ConnectedClaimedOutboxCommand {
  return {
    attemptCount: 1,
    body: "hello",
    chatroomId: "room-1",
    clientMsgId: "client-1",
    commandId: "command-1",
    errorCode: null,
    leaseExpiresAtMs: 30000,
    leaseToken: "lease-1",
    localId: "local-1",
    nextAttemptAtMs: 0,
    state: "in_flight",
    ...overrides,
  };
}

function canonicalUpsert(
  overrides: Partial<ConnectedCanonicalMessageUpsert> = {},
): ConnectedCanonicalMessageUpsert {
  return {
    body: "hello",
    chatroomId: "room-1",
    clientMsgId: "client-1",
    createdAtRaw: "2026-09-10T00:00:00Z",
    kind: "user",
    localId: "local-1",
    media: [],
    senderAvatarUrl: null,
    senderId: USER_ID,
    senderNickname: null,
    serverMessageId: "server-1",
    ...overrides,
  };
}

/** Deterministic in-memory fake of the five repository primitives the dispatcher owns. */
function fixture() {
  const commands = new Map<string, ConnectedClaimedOutboxCommand>();
  let leaseCounter = 0;
  let active = true;
  let nowMs = 0;

  function enqueue(command: ConnectedClaimedOutboxCommand) {
    commands.set(command.commandId, command);
  }

  const claimDueOutboxCommands = jest.fn(
    async ({
      leaseExpiresAtMs,
      leaseToken,
      limit,
    }: Readonly<{
      leaseExpiresAtMs: number;
      leaseToken: string;
      limit: number;
      nowMs: number;
    }>) => {
      const claimed: ConnectedClaimedOutboxCommand[] = [];
      for (const command of commands.values()) {
        if (claimed.length >= limit) break;
        if (command.state !== "queued" || command.nextAttemptAtMs > nowMs)
          continue;
        const updated: ConnectedClaimedOutboxCommand = {
          ...command,
          attemptCount: command.attemptCount + 1,
          leaseExpiresAtMs,
          leaseToken,
          state: "in_flight",
        };
        commands.set(command.commandId, updated);
        claimed.push(updated);
      }
      return claimed;
    },
  );

  const rescheduleClaimedOutboxCommand = jest.fn(
    async ({
      commandId,
      errorCode,
      leaseToken,
      nextAttemptAtMs,
    }: Readonly<{
      commandId: string;
      errorCode: ConnectedSendErrorCode;
      leaseToken: string;
      nextAttemptAtMs: number;
    }>) => {
      const existing = commands.get(commandId);
      if (
        !existing ||
        existing.state !== "in_flight" ||
        existing.leaseToken !== leaseToken
      )
        return false;
      commands.set(commandId, {
        ...existing,
        errorCode,
        nextAttemptAtMs,
        state: "queued",
      });
      return true;
    },
  );

  const failClaimedOutboxCommand = jest.fn(
    async ({
      commandId,
      errorCode,
      leaseToken,
    }: Readonly<{
      commandId: string;
      errorCode: ConnectedSendErrorCode;
      leaseToken: string;
    }>) => {
      const existing = commands.get(commandId);
      if (
        !existing ||
        existing.state !== "in_flight" ||
        existing.leaseToken !== leaseToken
      )
        return false;
      commands.set(commandId, { ...existing, errorCode, state: "failed" });
      return true;
    },
  );

  const releaseOutboxClaims = jest.fn(
    async ({
      leaseToken,
      nextAttemptAtMs,
    }: Readonly<{ leaseToken: string; nextAttemptAtMs: number }>) => {
      let released = 0;
      for (const [commandId, command] of commands) {
        if (command.state !== "in_flight" || command.leaseToken !== leaseToken)
          continue;
        commands.set(commandId, {
          ...command,
          nextAttemptAtMs,
          state: "queued",
        });
        released += 1;
      }
      return released;
    },
  );

  const mergeCanonicalMessage = jest.fn(
    async (input: ConnectedCanonicalMessageUpsert) => {
      for (const [commandId, command] of commands) {
        if (
          command.clientMsgId === input.clientMsgId &&
          input.senderId === USER_ID
        ) {
          commands.set(commandId, {
            ...command,
            errorCode: null,
            state: "acked",
          });
        }
      }
      return {
        ...input,
        localCreatedAtMs: 0,
        senderAvatarUrl: null,
        senderNickname: null,
        status: "sent" as const,
      };
    },
  );

  const repository: OutboxDispatcherRepository = {
    claimDueOutboxCommands,
    failClaimedOutboxCommand,
    mergeCanonicalMessage,
    releaseOutboxClaims,
    rescheduleClaimedOutboxCommand,
  };

  return {
    claimDueOutboxCommands,
    commands,
    enqueue,
    failClaimedOutboxCommand,
    mergeCanonicalMessage,
    releaseOutboxClaims,
    rescheduleClaimedOutboxCommand,
    repository,
    setActive: (value: boolean) => {
      active = value;
    },
    setNowMs: (value: number) => {
      nowMs = value;
    },
    createLeaseToken: () => `lease-${(leaseCounter += 1)}`,
    isActive: () => active,
    nowMs: () => nowMs,
  };
}

describe("persistent outbox dispatcher", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("drains a due queued command and verifies identity before the canonical merge acks it", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    const send = jest.fn(async () => canonicalUpsert());
    const onChanged = jest.fn();
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      onChanged,
      principal: { userId: USER_ID },
      random: () => 0.5,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(f.commands.get("command-1")?.state).toBe("acked");
    expect(onChanged).toHaveBeenCalled();
    dispatcher.dispose();
  });

  test("a lost canonical response retries the unchanged client_msg_id/body identity", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    const failure: OutboxSendFailure = { kind: "network" };
    const send = jest
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(async () => canonicalUpsert());
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(f.commands.get("command-1")?.state).toBe("queued");
    f.setNowMs(60_000);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(2);
    const firstCommand = send.mock
      .calls[0]?.[0] as ConnectedClaimedOutboxCommand;
    const secondCommand = send.mock
      .calls[1]?.[0] as ConnectedClaimedOutboxCommand;
    expect(secondCommand.clientMsgId).toBe(firstCommand.clientMsgId);
    expect(secondCommand.body).toBe(firstCommand.body);
    expect(f.commands.get("command-1")?.state).toBe("acked");
    dispatcher.dispose();
  });

  test.each<[OutboxSendFailure["kind"], ConnectedSendErrorCode]>([
    ["network", "network"],
    ["timeout", "network"],
    ["rate_limited", "server_unavailable"],
    ["server_error", "server_unavailable"],
  ])(
    "%s failures reschedule the command and keep it queued",
    async (kind, expectedErrorCode) => {
      const f = fixture();
      f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
      const failure: OutboxSendFailure = { kind };
      const send = jest.fn().mockRejectedValueOnce(failure);
      const dispatcher = createOutboxDispatcher({
        createLeaseToken: f.createLeaseToken,
        isActive: f.isActive,
        nowMs: f.nowMs,
        principal: { userId: USER_ID },
        random: () => 0,
        repository: f.repository,
        send,
      });
      dispatcher.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(f.repository.rescheduleClaimedOutboxCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: "command-1",
          errorCode: expectedErrorCode,
        }),
      );
      expect(f.commands.get("command-1")?.state).toBe("queued");
      dispatcher.dispose();
    },
  );

  test("honors an explicit Retry-After delay instead of computed backoff", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    const failure: OutboxSendFailure = {
      kind: "rate_limited",
      retryAfterMs: 45_000,
    };
    const send = jest.fn().mockRejectedValueOnce(failure);
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0.999,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.repository.rescheduleClaimedOutboxCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: "command-1",
        nextAttemptAtMs: 45_000,
      }),
    );
    dispatcher.dispose();
  });

  test("honors a finite server Retry-After longer than the local polling interval", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    const send = jest.fn().mockRejectedValueOnce({
      kind: "rate_limited",
      retryAfterMs: 3_600_000,
    } satisfies OutboxSendFailure);
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.repository.rescheduleClaimedOutboxCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: "command-1",
        nextAttemptAtMs: 3_600_000,
      }),
    );
    dispatcher.dispose();
  });

  test.each<[OutboxSendFailure["kind"], ConnectedSendErrorCode]>([
    ["forbidden", "forbidden"],
    ["not_found", "forbidden"],
    ["conflict", "conflict"],
    ["validation", "validation"],
  ])(
    "%s failures become a stable failed state",
    async (kind, expectedErrorCode) => {
      const f = fixture();
      f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
      const failure: OutboxSendFailure = { kind };
      const send = jest.fn().mockRejectedValueOnce(failure);
      const dispatcher = createOutboxDispatcher({
        createLeaseToken: f.createLeaseToken,
        isActive: f.isActive,
        nowMs: f.nowMs,
        principal: { userId: USER_ID },
        random: () => 0,
        repository: f.repository,
        send,
      });
      dispatcher.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(f.repository.failClaimedOutboxCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: "command-1",
          errorCode: expectedErrorCode,
        }),
      );
      expect(f.commands.get("command-1")?.state).toBe("failed");
      dispatcher.dispose();
    },
  );

  test.each<[OutboxSendFailure["kind"], OutboxPauseReason]>([
    ["unauthorized", "unauthorized"],
    ["upgrade_required", "upgrade-required"],
  ])(
    "%s pauses automatic work, preserves the queue, and reports the reason",
    async (kind, expectedReason) => {
      const f = fixture();
      f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
      const failure: OutboxSendFailure = { kind };
      const send = jest.fn().mockRejectedValueOnce(failure);
      const onPaused = jest.fn();
      const dispatcher = createOutboxDispatcher({
        createLeaseToken: f.createLeaseToken,
        isActive: f.isActive,
        nowMs: f.nowMs,
        onPaused,
        principal: { userId: USER_ID },
        random: () => 0,
        repository: f.repository,
        send,
      });
      dispatcher.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(onPaused).toHaveBeenCalledWith(expectedReason);
      expect(f.commands.get("command-1")?.state).toBe("queued");
      expect(f.repository.failClaimedOutboxCommand).not.toHaveBeenCalled();
      expect(f.releaseOutboxClaims).toHaveBeenCalled();
      // Automatic polling must not reclaim the paused batch on its own.
      send.mockClear();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(send).not.toHaveBeenCalled();
      dispatcher.resume();
      send.mockImplementationOnce(async () => canonicalUpsert());
      await jest.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(1);
      dispatcher.dispose();
    },
  );

  test("a send result whose identity does not match the command fails instead of merging", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    const send = jest.fn(async () =>
      canonicalUpsert({ clientMsgId: "someone-elses-id" }),
    );
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.repository.mergeCanonicalMessage).not.toHaveBeenCalled();
    expect(f.repository.failClaimedOutboxCommand).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: "command-1", errorCode: "unknown" }),
    );
    dispatcher.dispose();
  });

  test("dispose aborts an in-flight send, releases the claim, and ignores the late completion", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    let capturedSignal: AbortSignal | undefined;
    let resolveSend!: (value: ConnectedCanonicalMessageUpsert) => void;
    const send = jest.fn(
      (_command: ConnectedClaimedOutboxCommand, signal: AbortSignal) => {
        capturedSignal = signal;
        return new Promise<ConnectedCanonicalMessageUpsert>((resolve) => {
          resolveSend = resolve;
        });
      },
    );
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    dispatcher.dispose();
    expect(capturedSignal?.aborted).toBe(true);
    expect(f.releaseOutboxClaims).toHaveBeenCalled();
    expect(f.commands.get("command-1")?.state).toBe("queued");
    resolveSend(canonicalUpsert());
    await jest.advanceTimersByTimeAsync(0);
    expect(f.repository.mergeCanonicalMessage).not.toHaveBeenCalled();
  });

  test("dispose does not touch the repository once the scope is no longer active", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    let resolveSend!: (value: ConnectedCanonicalMessageUpsert) => void;
    const send = jest.fn(
      () =>
        new Promise<ConnectedCanonicalMessageUpsert>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    f.setActive(false);
    dispatcher.dispose();
    expect(f.releaseOutboxClaims).not.toHaveBeenCalled();
    resolveSend(canonicalUpsert());
    await jest.advanceTimersByTimeAsync(0);
    expect(f.repository.mergeCanonicalMessage).not.toHaveBeenCalled();
  });

  test("a late claim after pause and resume is released but never dispatched", async () => {
    const f = fixture();
    let resolveClaim!: (value: ConnectedClaimedOutboxCommand[]) => void;
    f.claimDueOutboxCommands.mockImplementationOnce(
      () =>
        new Promise<ConnectedClaimedOutboxCommand[]>((resolve) => {
          resolveClaim = resolve;
        }),
    );
    const send = jest.fn(async () => canonicalUpsert());
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    dispatcher.pause();
    dispatcher.resume();
    resolveClaim([claimedCommand({ leaseToken: "lease-1" })]);
    await jest.advanceTimersByTimeAsync(0);
    expect(send).not.toHaveBeenCalled();
    expect(f.releaseOutboxClaims).toHaveBeenCalledWith({
      leaseToken: "lease-1",
      nextAttemptAtMs: 0,
    });
    dispatcher.dispose();
  });

  test("pause and resume fence an abort-ignoring old send before a fresh flight merges", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    let capturedSignal: AbortSignal | undefined;
    let resolveOld!: (value: ConnectedCanonicalMessageUpsert) => void;
    const send = jest
      .fn<
        Promise<ConnectedCanonicalMessageUpsert>,
        [ConnectedClaimedOutboxCommand, AbortSignal]
      >(async () => canonicalUpsert({ serverMessageId: "server-fresh" }))
      .mockImplementationOnce(
        (_command: ConnectedClaimedOutboxCommand, signal: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<ConnectedCanonicalMessageUpsert>((resolve) => {
            resolveOld = resolve;
          });
        },
      );
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    dispatcher.pause();
    expect(capturedSignal?.aborted).toBe(true);
    dispatcher.resume();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(f.repository.mergeCanonicalMessage).toHaveBeenCalledWith(
      canonicalUpsert({ serverMessageId: "server-fresh" }),
    );
    resolveOld(canonicalUpsert({ serverMessageId: "server-old" }));
    await jest.advanceTimersByTimeAsync(0);
    expect(f.repository.mergeCanonicalMessage).toHaveBeenCalledTimes(1);
    expect(f.repository.mergeCanonicalMessage).not.toHaveBeenCalledWith(
      canonicalUpsert({ serverMessageId: "server-old" }),
    );
    dispatcher.dispose();
  });

  test.each<
    [
      "reschedule" | "fail",
      OutboxSendFailure,
      (f: ReturnType<typeof fixture>) => jest.Mock,
    ]
  >([
    [
      "reschedule",
      { kind: "network" },
      (f) => f.rescheduleClaimedOutboxCommand,
    ],
    ["fail", { kind: "forbidden" }, (f) => f.failClaimedOutboxCommand],
  ])(
    "a %s persistence failure is contained and cannot strand the dispatcher cycle",
    async (_operation, failure, operation) => {
      const f = fixture();
      f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
      operation(f).mockRejectedValueOnce(new Error("sqlite write failed"));
      const send = jest
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(canonicalUpsert());
      const dispatcher = createOutboxDispatcher({
        createLeaseToken: f.createLeaseToken,
        isActive: f.isActive,
        nowMs: f.nowMs,
        principal: { userId: USER_ID },
        random: () => 0,
        repository: f.repository,
        send,
      });
      dispatcher.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(f.releaseOutboxClaims).toHaveBeenCalledWith({
        leaseToken: "lease-1",
        nextAttemptAtMs: 0,
      });
      dispatcher.wake();
      await jest.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(2);
      expect(f.commands.get("command-1")?.state).toBe("acked");
      dispatcher.dispose();
    },
  );

  test("does not publish a changed callback after scope becomes inactive during persistence", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    let resolveReschedule!: (value: boolean) => void;
    f.rescheduleClaimedOutboxCommand.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveReschedule = resolve;
        }),
    );
    const onChanged = jest.fn();
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      onChanged,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send: jest.fn().mockRejectedValueOnce({ kind: "network" }),
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    f.setActive(false);
    resolveReschedule(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(onChanged).not.toHaveBeenCalled();
    dispatcher.dispose();
  });

  test("claims one command at a time and releases a command that expires before send", async () => {
    const f = fixture();
    const send = jest.fn(async () => canonicalUpsert());
    f.claimDueOutboxCommands.mockImplementationOnce(async (input) => {
      f.setNowMs(input.leaseExpiresAtMs);
      return [
        claimedCommand({
          leaseExpiresAtMs: input.leaseExpiresAtMs,
          leaseToken: input.leaseToken,
        }),
      ];
    });
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.claimDueOutboxCommands).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(f.releaseOutboxClaims).toHaveBeenCalledWith({
      leaseToken: "lease-1",
      nextAttemptAtMs: f.nowMs(),
    });
    dispatcher.dispose();
  });

  test("repeated start/wake calls never overlap a cycle in flight", async () => {
    const f = fixture();
    f.enqueue(claimedCommand({ nextAttemptAtMs: 0, state: "queued" }));
    let resolveSend!: (value: ConnectedCanonicalMessageUpsert) => void;
    const send = jest.fn(
      () =>
        new Promise<ConnectedCanonicalMessageUpsert>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    dispatcher.start();
    dispatcher.wake();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.repository.claimDueOutboxCommands).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    resolveSend(canonicalUpsert());
    await jest.advanceTimersByTimeAsync(0);
    dispatcher.dispose();
  });

  test("idle polling is bounded and does not busy-loop when nothing is due", async () => {
    const f = fixture();
    const send = jest.fn();
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send,
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.repository.claimDueOutboxCommands).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(4_999);
    expect(f.repository.claimDueOutboxCommands).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(f.repository.claimDueOutboxCommands).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
    dispatcher.dispose();
  });

  test("an inactive scope is polled without touching the repository", async () => {
    const f = fixture();
    f.setActive(false);
    const dispatcher = createOutboxDispatcher({
      createLeaseToken: f.createLeaseToken,
      isActive: f.isActive,
      nowMs: f.nowMs,
      principal: { userId: USER_ID },
      random: () => 0,
      repository: f.repository,
      send: jest.fn(),
    });
    dispatcher.start();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(f.repository.claimDueOutboxCommands).not.toHaveBeenCalled();
    dispatcher.dispose();
  });
});
