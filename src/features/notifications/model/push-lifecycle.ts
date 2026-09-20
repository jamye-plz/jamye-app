/**
 * Pure permission/token/installation lifecycle state machine for Expo push.
 * No React, no native modules — every native/HTTP effect is either an input
 * already resolved by the caller (permission status, token resolution) or
 * an injected `PushInstallationsPort` call. This keeps the file testable
 * without `push-notifications-adapter.ts` and decoupled from A1's concrete
 * HTTP implementation (a later task wires the real port in); it mirrors the
 * `subscribe`/`getState`/listener-`Set` shape of
 * `src/core/auth/auth-controller.ts`.
 */

// `PushPlatform`/`PushEnvironment`/`PushInstallation` are pure value shapes
// (no runtime dependency on A1's concrete HTTP module), so they are
// re-exported from the server contract instead of redeclared here.
import type {
  PushInstallation,
  PushInstallationPlatform as PushPlatform,
  PushInstallationEnvironment as PushEnvironment,
} from "@/core/contracts/server";
export type { PushInstallation, PushPlatform, PushEnvironment };

export type PushPermissionStatus = "granted" | "denied" | "undetermined";
export type PushDisabledReason =
  "missing_project_id" | "not_physical_device" | "permission_denied";

export type CreateInstallationInput = Readonly<{
  platform: PushPlatform;
  environment: PushEnvironment;
  installationId: string;
  expoToken: string;
  messagePreviewEnabled: boolean;
}>;

export type UpdateInstallationInput = Readonly<{
  expoToken?: string;
  messagePreviewEnabled?: boolean;
}>;

/**
 * Deliberately narrower than the shared `PushInstallationsPort_shared_shape`
 * from the plan's requirements brief (no `accessToken`/`AbortSignal`
 * params): A4 wires the real, access-token-bound implementation in behind
 * this shape via a closure, so this file never depends on A1's concrete
 * HTTP module and the two tier-1 tasks stay independent.
 */
export type PushInstallationsPort = Readonly<{
  create: (input: CreateInstallationInput) => Promise<PushInstallation>;
  update: (
    installationId: string,
    input: UpdateInstallationInput,
  ) => Promise<PushInstallation>;
  delete: (installationId: string) => Promise<void>;
}>;

export type PushTokenResolution =
  | Readonly<{ ok: true; token: string }>
  | Readonly<{
      ok: false;
      reason: "missing_project_id" | "not_physical_device";
    }>;

export type StartInput = Readonly<{
  installationId: string;
  platform: PushPlatform;
  environment: PushEnvironment;
  messagePreviewEnabled: boolean;
  permissionStatus: PushPermissionStatus;
  token: PushTokenResolution;
}>;

export type PushLifecycleState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "checking" }>
  | Readonly<{
      status: "disabled";
      reason: PushDisabledReason;
      message: string;
    }>
  | Readonly<{ status: "registering" }>
  | Readonly<{ status: "registered"; installation: PushInstallation }>
  | Readonly<{ status: "rotating"; installation: PushInstallation }>
  | Readonly<{ status: "stale"; installation: PushInstallation }>
  | Readonly<{
      status: "stale_unrecoverable";
      installation: PushInstallation;
      message: string;
    }>
  | Readonly<{ status: "deleting"; installation: PushInstallation }>
  | Readonly<{ status: "deleted" }>
  | Readonly<{ status: "error"; message: string }>;

export type PushLifecycle = ReturnType<typeof createPushLifecycle>;

const DISABLED_MESSAGES: Readonly<Record<PushDisabledReason, string>> = {
  missing_project_id:
    "푸시 알림을 사용할 수 없습니다. 앱 설정이 완료되지 않았습니다.",
  not_physical_device:
    "이 기기에서는 푸시 토큰을 받을 수 없습니다. 실제 기기에서 다시 시도해 주세요.",
  permission_denied:
    "알림 권한이 거부되어 푸시 알림을 사용할 수 없습니다. 설정에서 알림 권한을 허용해 주세요.",
};
const STALE_UNRECOVERABLE_MESSAGE =
  "푸시 등록이 서버에서 비활성화되어 자동 복구에 실패했습니다. 다시 로그인하거나 나중에 다시 시도해 주세요.";
const REGISTRATION_ERROR_MESSAGE =
  "푸시 알림 등록 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
const UPDATE_ERROR_MESSAGE =
  "푸시 알림 설정을 업데이트할 수 없습니다. 잠시 후 다시 시도해 주세요.";
const PLATFORM_ERROR_MESSAGE =
  "푸시 알림을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function createPushLifecycle(port: PushInstallationsPort) {
  let state: PushLifecycleState = { status: "idle" };
  /**
   * The last expo_token successfully sent to the server. A preview-only P3
   * update (no fresh token) that comes back stale still needs a token to
   * re-register (P2) with, so this is retained independently of the
   * `installation` value carried in `state` (the server's PushInstallation
   * shape does not echo the token back).
   */
  let lastToken: string | null = null;
  const listeners = new Set<(value: PushLifecycleState) => void>();

  function publish(next: PushLifecycleState): void {
    state = next;
    listeners.forEach((listener) => listener(state));
  }

  function currentInstallation(): PushInstallation | null {
    switch (state.status) {
      case "registered":
      case "rotating":
      case "stale":
      case "stale_unrecoverable":
      case "deleting":
        return state.installation;
      default:
        return null;
    }
  }

  /** Shared stale-then-reregister-once tail for both the P2 and P3 flows. */
  async function resolveOrReregister(
    installation: PushInstallation,
    reregisterInput: CreateInstallationInput,
  ): Promise<void> {
    if (installation.disabledAt === null) {
      publish({ status: "registered", installation });
      return;
    }
    publish({ status: "stale", installation });
    let retried: PushInstallation;
    try {
      retried = await port.create(reregisterInput);
    } catch {
      publish({ status: "error", message: REGISTRATION_ERROR_MESSAGE });
      return;
    }
    lastToken = reregisterInput.expoToken;
    if (retried.disabledAt === null) {
      publish({ status: "registered", installation: retried });
    } else {
      publish({
        status: "stale_unrecoverable",
        installation: retried,
        message: STALE_UNRECOVERABLE_MESSAGE,
      });
    }
  }

  async function registerWithStaleRecovery(
    input: CreateInstallationInput,
  ): Promise<void> {
    publish({ status: "registering" });
    lastToken = input.expoToken;
    let installation: PushInstallation;
    try {
      installation = await port.create(input);
    } catch {
      publish({ status: "error", message: REGISTRATION_ERROR_MESSAGE });
      return;
    }
    await resolveOrReregister(installation, input);
  }

  async function updateWithStaleRecovery(
    update: UpdateInstallationInput,
  ): Promise<void> {
    const installation = currentInstallation();
    if (!installation) return;
    publish({ status: "rotating", installation });
    let updated: PushInstallation;
    try {
      updated = await port.update(installation.installationId, update);
    } catch {
      publish({ status: "error", message: UPDATE_ERROR_MESSAGE });
      return;
    }
    if (update.expoToken) lastToken = update.expoToken;
    const token = update.expoToken ?? lastToken;
    if (!token) {
      // No token has ever been recorded (should not happen once registered,
      // since registration always records one); surface as unrecoverable
      // rather than re-registering with an empty token.
      publish({
        status: "stale_unrecoverable",
        installation: updated,
        message: STALE_UNRECOVERABLE_MESSAGE,
      });
      return;
    }
    await resolveOrReregister(updated, {
      installationId: installation.installationId,
      platform: installation.platform,
      environment: installation.environment,
      expoToken: token,
      messagePreviewEnabled:
        update.messagePreviewEnabled ?? installation.messagePreviewEnabled,
    });
  }

  return {
    getState: (): PushLifecycleState => state,

    subscribe(listener: (value: PushLifecycleState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Drives P2 registration on sign-in. Permission/token degradation always surfaces as `disabled`, never a thrown error. */
    async start(input: StartInput): Promise<void> {
      publish({ status: "checking" });
      if (input.permissionStatus !== "granted") {
        publish({
          status: "disabled",
          reason: "permission_denied",
          message: DISABLED_MESSAGES.permission_denied,
        });
        return;
      }
      if (!input.token.ok) {
        publish({
          status: "disabled",
          reason: input.token.reason,
          message: DISABLED_MESSAGES[input.token.reason],
        });
        return;
      }
      await registerWithStaleRecovery({
        installationId: input.installationId,
        platform: input.platform,
        environment: input.environment,
        expoToken: input.token.token,
        messagePreviewEnabled: input.messagePreviewEnabled,
      });
    },

    /** Drives P3 on token rotation. A no-op if there is no current installation to rotate. */
    async rotateToken(expoToken: string): Promise<void> {
      await updateWithStaleRecovery({ expoToken });
    },

    /** Drives P3 on a message-preview toggle. A no-op if there is no current installation. */
    async setMessagePreviewEnabled(
      messagePreviewEnabled: boolean,
    ): Promise<void> {
      await updateWithStaleRecovery({ messagePreviewEnabled });
    },

    /**
     * Drives P4 on sign-out/disable, best-effort: a delete failure still
     * ends at `deleted` so logout is never blocked. A true no-op (no port
     * call, no state change) when there is no current installation, so an
     * account switch can unconditionally call `teardown()` before `start()`
     * for the next principal without side effects when nothing was ever
     * registered.
     */
    async teardown(): Promise<void> {
      const installation = currentInstallation();
      if (!installation) return;
      publish({ status: "deleting", installation });
      try {
        await port.delete(installation.installationId);
      } catch {
        // Best-effort: a delete failure/timeout must not block logout.
      } finally {
        lastToken = null;
        publish({ status: "deleted" });
      }
    },

    /**
     * Records a pre-registration platform failure (secure storage, permission
     * or token lookup rejecting) as a recoverable `error`, so the provider
     * never leaks an unhandled rejection and the settings UI can offer retry.
     */
    markPlatformFailure(): void {
      publish({ status: "error", message: PLATFORM_ERROR_MESSAGE });
    },
  };
}
