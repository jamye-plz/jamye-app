import type { MediaKind, MediaScope } from "@/core/contracts/server/media";
import {
  evaluateMediaContentPolicy,
  MAX_CHAT_ATTACHMENTS,
  MAX_FILENAME_LENGTH,
  type MediaContentRejectReason,
  type MediaFileInput,
} from "@/features/media/model/media-policy";

export type { MediaKind, MediaScope, MediaFileInput };
export { MAX_CHAT_ATTACHMENTS, MAX_FILENAME_LENGTH };

/** Picker filter hint only (which files the OS document picker offers to choose from)
 * — not a policy decision. The authoritative MIME/size/scope gate is
 * `@/features/media/model/media-policy.ts`'s `evaluateMediaContentPolicy`. */
export const AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
] as const;

const REJECT_MESSAGES: Record<MediaContentRejectReason, string> = {
  unsupported_mime:
    "호환 가능한 파일 형식으로 준비하지 못했습니다. JPEG·PNG·WebP·GIF 이미지나 MP4 동영상, 음성(webm/mp4/ogg) 파일을 선택해 주세요.",
  file_too_large: "파일 용량이 너무 큽니다.",
  empty_file: "빈 파일은 첨부할 수 없습니다.",
  filename_too_long: "파일 이름이 너무 깁니다.",
  scope_not_allowed: "이 화면에서는 첨부할 수 없는 파일 형식입니다.",
};

export type MediaPolicyResult =
  | Readonly<{ accepted: true; kind: MediaKind }>
  | Readonly<{
      accepted: false;
      reason: MediaContentRejectReason;
      message: string;
    }>;

/**
 * Thin Korean-message layer over the single authoritative policy gate
 * (`model/media-policy.ts`'s `evaluateMediaContentPolicy`) — this file used to carry
 * its own independent MIME/size/scope table, which drifted from the model-tier one; see
 * `.agents/results/result-m11-media-core-20260910-225702.md` section 6. Do not
 * reintroduce a second threshold table here.
 */
export function evaluateSelectedMedia(
  scope: MediaScope,
  file: MediaFileInput,
): MediaPolicyResult {
  const result = evaluateMediaContentPolicy(scope, file);
  if (result.ok) return { accepted: true, kind: result.kind };
  return {
    accepted: false,
    reason: result.reason,
    message: REJECT_MESSAGES[result.reason],
  };
}
