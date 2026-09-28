import type { PushLifecycleState } from "../model/push-lifecycle";

const REGISTERED_STATUSES: ReadonlySet<PushLifecycleState["status"]> = new Set([
  "registered",
  "rotating",
  "stale",
]);

export function isPushRegistered(state: PushLifecycleState): boolean {
  return REGISTERED_STATUSES.has(state.status);
}

export function isPushBusy(state: PushLifecycleState): boolean {
  return (
    state.status === "idle" ||
    state.status === "checking" ||
    state.status === "registering" ||
    state.status === "deleting"
  );
}

export function isPushPermissionDenied(state: PushLifecycleState): boolean {
  return state.status === "disabled" && state.reason === "permission_denied";
}

/**
 * A3: raw diagnostic copy for every push-lifecycle.ts state. Moved here
 * (shared by `notification-settings-section.*.tsx` and
 * `developer-section.*.tsx`) so it only renders in the `__DEV__`-only
 * developer section -- the regular A1 alarm row shows toggle state only.
 */
export function describePushState(state: PushLifecycleState): string {
  switch (state.status) {
    case "idle":
    case "checking":
      return "알림 상태 확인 중…";
    case "registering":
      return "푸시 알림 등록 중…";
    case "registered":
      return "등록됨";
    case "rotating":
      return "토큰 갱신 중…";
    case "stale":
      return "서버와 재동기화 중…";
    case "stale_unrecoverable":
      return "동기화 실패 — 다시 로그인하거나 나중에 다시 시도해 주세요.";
    case "deleting":
      return "알림 해제 중…";
    case "deleted":
      return "사용 안 함";
    case "disabled":
      switch (state.reason) {
        case "permission_denied":
          return "권한 거부됨 — 설정 앱 > 알림에서 권한을 허용해 주세요.";
        case "missing_project_id":
          return "프로젝트 ID 없음 — 앱 설정이 완료되지 않았습니다.";
        case "not_physical_device":
          return "이 기기(시뮬레이터)에서는 사용할 수 없습니다.";
      }
      return state.message;
    case "error":
      return "오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return "알 수 없는 상태입니다.";
  }
}

export function maskExpoToken(token: string | null): string {
  if (!token) return "없음";
  if (token.length <= 10) return "••••";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
