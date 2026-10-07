import type { AvatarUploadErrorKind } from "@/core/contracts/server";

/**
 * AV-AC3: the Korean reason shown when a profile-photo change fails. Server
 * `error.code` strings never reach the screen -- every failure is reduced to
 * one of these kinds first (see `classifyAvatarUploadError`).
 */
export type AvatarFailureKind =
  | Exclude<AvatarUploadErrorKind, "cancelled">
  | "permission_denied"
  | "too_large"
  | "pick_failed"
  | "upload_failed";

export type AvatarFailure = Readonly<{
  kind: AvatarFailureKind;
  message: string;
  /** `다시 시도` is offered only when repeating the same action can succeed. */
  retryable: boolean;
}>;

const FAILURES: Record<
  AvatarFailureKind,
  Readonly<{ message: string; retryable: boolean }>
> = {
  network: {
    message: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    retryable: true,
  },
  rate_limited: {
    message: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  storage_unavailable: {
    message:
      "사진 저장소를 잠시 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  image_rejected: {
    message: "이 사진은 사용할 수 없습니다. 다른 사진을 선택해 주세요.",
    retryable: false,
  },
  upload_expired: {
    message: "업로드 시간이 지났습니다. 다시 시도해 주세요.",
    retryable: true,
  },
  session_expired: {
    message: "세션이 만료되었습니다. 다시 로그인해 주세요.",
    retryable: false,
  },
  unknown: {
    message: "프로필 사진을 바꾸지 못했습니다. 다시 시도해 주세요.",
    retryable: true,
  },
  permission_denied: {
    message:
      "사진 접근 권한이 필요합니다. 설정에서 사진 접근을 허용한 뒤 다시 시도해 주세요.",
    retryable: true,
  },
  too_large: {
    message: "사진 용량이 너무 큽니다. 다른 사진을 선택해 주세요.",
    retryable: false,
  },
  pick_failed: {
    message: "사진을 불러오지 못했습니다. 다시 시도해 주세요.",
    retryable: true,
  },
  upload_failed: {
    message: "사진을 올리지 못했습니다. 다시 시도해 주세요.",
    retryable: true,
  },
};

export function avatarFailure(kind: AvatarFailureKind): AvatarFailure {
  return { kind, ...FAILURES[kind] };
}

/**
 * Spoken status for screen-reader users (`AccessibilityInfo.announceFor
 * Accessibility`): the upload start and each success. Failures are not
 * announced here -- the native failure alert presents them.
 */
export const AVATAR_ANNOUNCEMENTS = Object.freeze({
  uploading: "프로필 사진을 올리는 중입니다",
  changed: "프로필 사진을 바꿨습니다",
  reset: "기본 이미지로 바꿨습니다",
});
