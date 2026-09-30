import type { UserProfile } from "@/core/auth/types";
import { NICKNAME_MAX_LENGTH } from "@/core/contracts/server";
import type { SessionContextValue } from "@/core/providers/session-provider";

/**
 * Structural mirror of A1's `src/features/account/data/account-api.ts`
 * `AccountApiPort` shape. Declared locally (not imported) so this module
 * stays decoupled from A1's concrete client -- any object satisfying this
 * shape (real client, test double) works.
 */
/**
 * Structural mirror of A1's `AppleAccountDeletionProof` (account-api.ts).
 * APPCON-AC5: use-delete-account-flow.ts builds this from a fresh Apple
 * reauthentication and passes it through `deleteAccount()` unchanged.
 */
export type AppleAccountDeletionProof = Readonly<{
  identityToken: string;
  authorizationCode: string;
  rawNonce: string;
}>;

export type AccountApiPort = Readonly<{
  updateProfile: (
    accessToken: string,
    input: Readonly<{ nickname?: string; avatarUrl?: string | null }>,
    signal?: AbortSignal,
  ) => Promise<UserProfile>;
  deleteAccount: (
    accessToken: string,
    appleProof?: AppleAccountDeletionProof,
    signal?: AbortSignal,
  ) => Promise<void>;
}>;

export type UpdateNicknameResult =
  | Readonly<{ status: "ok"; profile: UserProfile }>
  | Readonly<{ status: "invalid"; reason: "empty" | "too_long" }>
  | Readonly<{ status: "error"; code: string }>;

export type DeleteAccountResult =
  | Readonly<{ status: "ok" }>
  | Readonly<{ status: "blocked" }>
  | Readonly<{ status: "error"; code: string }>;

export type AccountLifecycleDeps = Readonly<{
  accountApi: AccountApiPort;
  session: Pick<
    SessionContextValue,
    "authorizedRequest" | "logout" | "applyProfile"
  >;
}>;

export type AccountLifecycle = Readonly<{
  updateNickname: (nickname: string) => Promise<UpdateNicknameResult>;
  deleteAccount: (
    appleProof?: AppleAccountDeletionProof,
  ) => Promise<DeleteAccountResult>;
}>;

const GROUP_OWNERSHIP_TRANSFER_REQUIRED_CODE =
  "group_ownership_transfer_required";
const IN_FLIGHT_CODE = "in_flight";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Structural read of an AccountApiPort rejection's `{status, code}` shape (never imports A1's error class). */
function errorCode(error: unknown): string {
  if (isRecord(error) && typeof error.code === "string") return error.code;
  return "unknown_error";
}

/**
 * Orchestrates U2 (nickname update) and U3 (account deletion) against the
 * session's authorized-request boundary. A single in-flight guard is shared
 * across both methods: nickname edits and account deletion are mutually
 * exclusive destructive/mutating operations on the same identity, so a
 * second call of either while the first is still pending returns
 * `{status:'error', code:'in_flight'}` rather than racing.
 */
export function createAccountLifecycle(
  deps: AccountLifecycleDeps,
): AccountLifecycle {
  let pending = false;

  async function withGuard<T>(onBusy: T, run: () => Promise<T>): Promise<T> {
    if (pending) return onBusy;
    pending = true;
    try {
      return await run();
    } finally {
      pending = false;
    }
  }

  return {
    async updateNickname(nickname: string): Promise<UpdateNicknameResult> {
      return withGuard<UpdateNicknameResult>(
        { status: "error", code: IN_FLIGHT_CODE },
        async () => {
          const trimmed = nickname.trim();
          if (trimmed.length === 0)
            return { status: "invalid", reason: "empty" };
          if (trimmed.length > NICKNAME_MAX_LENGTH)
            return { status: "invalid", reason: "too_long" };
          try {
            const profile = await deps.session.authorizedRequest(
              (accessToken, signal) =>
                deps.accountApi.updateProfile(
                  accessToken,
                  { nickname: trimmed },
                  signal,
                ),
            );
            deps.session.applyProfile(profile);
            return { status: "ok", profile };
          } catch (error) {
            return { status: "error", code: errorCode(error) };
          }
        },
      );
    },
    async deleteAccount(
      appleProof?: AppleAccountDeletionProof,
    ): Promise<DeleteAccountResult> {
      return withGuard<DeleteAccountResult>(
        { status: "error", code: IN_FLIGHT_CODE },
        async () => {
          try {
            await deps.session.authorizedRequest((accessToken, signal) =>
              deps.accountApi.deleteAccount(accessToken, appleProof, signal),
            );
          } catch (error) {
            if (errorCode(error) === GROUP_OWNERSHIP_TRANSFER_REQUIRED_CODE)
              return { status: "blocked" };
            return { status: "error", code: errorCode(error) };
          }
          // task-app-device fix1 (device verification): no local push teardown runs
          // before this DELETE call anymore. The server already disables
          // this account's push installations inside the same deletion
          // transaction (jamye-server's
          // src/adapters/postgres/account_deletion/grace.rs
          // disable_push_installations), so a rejected/blocked delete (409
          // group_ownership_transfer_required, 422 Apple proof errors,
          // 500/503, network failure, or a cancelled Apple reauthentication)
          // leaves this device's push subscription untouched -- there is
          // nothing to restore. The DELETE resolved (204): tokens are
          // server-invalidated already, so a local logout failure must never
          // block reporting success. PushLifecycleProvider's
          // principal-vanished effect (push-lifecycle-provider.tsx) clears
          // local push state once `session.logout()` below fires; an
          // account restored via re-login re-registers through that same
          // provider's `enable()`.
          await deps.session.logout().catch(() => undefined);
          return { status: "ok" };
        },
      );
    },
  };
}
