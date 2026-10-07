import { validateAvatarUploadCreate } from "./validators";
import type {
  AvatarUploadCreateWire,
  AvatarUploadIntentWire,
} from "./validators";

/**
 * U4/U5 avatar upload (M17 task-app-avatar, AV-AC8), mapped from the deployed
 * server contract (jamye-server f86012e, contract v2):
 *
 * - U4 `POST /api/v1/me/avatar/uploads` takes `{content_type: "image/jpeg",
 *   byte_size: 1..1 MiB}` (no conversation target) and returns 201
 *   `{upload_id, presigned_put: {url, expires_in: 900}}`.
 * - The client PUTs the JPEG bytes to `presigned_put.url` (no API bearer).
 * - U5 `POST /api/v1/me/avatar/uploads/{upload_id}/finalize` takes `{}` and
 *   returns the updated `User`, whose `avatar_url` is the server-minted public
 *   U6 URL (`GET /api/v1/avatars/{avatar_id}`, public, immutable, so the app
 *   keeps rendering `avatar_url` with the existing Avatar component).
 */
export const AVATAR_CONTENT_TYPE = "image/jpeg";
export const AVATAR_MAX_BYTES = 1_048_576;

/** Stable machine-readable `error.code` values of U4/U5 (never shown to users). */
export const AVATAR_UPLOAD_ERROR_CODES = Object.freeze({
  unauthenticated: "authentication_required",
  validation: "request_validation_failed",
  rateLimited: "rate_limit_exceeded",
  storageDegraded: "object_storage_degraded",
  notFound: "avatar_upload_not_found",
  notPending: "avatar_upload_not_pending",
  objectInvalid: "avatar_object_invalid",
});

export type AvatarUploadIntent = Readonly<{
  uploadId: string;
  put: Readonly<{ url: string; expiresIn: number }>;
}>;

export function isValidAvatarByteSize(byteSize: number): boolean {
  return (
    Number.isInteger(byteSize) && byteSize >= 1 && byteSize <= AVATAR_MAX_BYTES
  );
}

export function avatarUploadCreateToWire(
  byteSize: number,
): AvatarUploadCreateWire {
  if (!isValidAvatarByteSize(byteSize))
    throw new RangeError("invalid_avatar_size");
  const wire: AvatarUploadCreateWire = {
    content_type: AVATAR_CONTENT_TYPE,
    byte_size: byteSize,
  };
  if (!validateAvatarUploadCreate(wire))
    throw new RangeError("invalid_avatar_upload_create");
  return wire;
}

export function mapAvatarUploadIntent(
  wire: AvatarUploadIntentWire,
): AvatarUploadIntent {
  return {
    uploadId: wire.upload_id,
    put: {
      url: wire.presigned_put.url,
      expiresIn: wire.presigned_put.expires_in,
    },
  };
}

/**
 * How the UI should treat an avatar upload failure. The model maps each kind
 * to Korean copy; raw server codes are never displayed.
 */
export type AvatarUploadErrorKind =
  | "network"
  | "rate_limited"
  | "storage_unavailable"
  | "image_rejected"
  | "upload_expired"
  | "session_expired"
  | "cancelled"
  | "unknown";

/** Structural read of an `{status, code}` API error (never imports a client's error class). */
export function classifyAvatarUploadError(
  error: unknown,
): AvatarUploadErrorKind {
  if (typeof error !== "object" || error === null) return "unknown";
  const { status, code } = error as { status?: unknown; code?: unknown };
  if (typeof status !== "number" || typeof code !== "string") return "unknown";
  if (code === "request_cancelled") return "cancelled";
  if (code === "network_unavailable" || code === "request_timeout")
    return "network";
  if (status === 401 || code === AVATAR_UPLOAD_ERROR_CODES.unauthenticated)
    return "session_expired";
  if (code === AVATAR_UPLOAD_ERROR_CODES.rateLimited) return "rate_limited";
  if (code === AVATAR_UPLOAD_ERROR_CODES.storageDegraded)
    return "storage_unavailable";
  if (
    code === AVATAR_UPLOAD_ERROR_CODES.objectInvalid ||
    code === AVATAR_UPLOAD_ERROR_CODES.validation
  )
    return "image_rejected";
  if (
    code === AVATAR_UPLOAD_ERROR_CODES.notFound ||
    code === AVATAR_UPLOAD_ERROR_CODES.notPending
  )
    return "upload_expired";
  return "unknown";
}
