import type { UserProfile } from "@/core/auth/types";
import {
  avatarUploadCreateToWire,
  isValidAvatarByteSize,
  mapAvatarUploadIntent,
  mapUserProfile,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  userPatchToWire,
  validateAvatarUploadFinalize,
  validateAvatarUploadIntent,
  validateUser,
} from "@/core/contracts/server";
import type {
  AvatarUploadIntent,
  UserPatchInput,
} from "@/core/contracts/server";
import { parsePublicMediaOrigin } from "@/core/config/public-env";
import { createHttpRequester } from "@/core/http/http-requester";
import {
  MediaOriginError,
  requireMediaOriginUrl,
} from "@/features/media/data/media-transport";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AccountApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}

// APPCON-AC5 (U3 Apple proof, plan api_contracts.server.apple_account_deletion).
export type AppleAccountDeletionProof = Readonly<{
  identityToken: string;
  authorizationCode: string;
  rawNonce: string;
}>;

export type AccountApiPort = Readonly<{
  updateProfile: (
    accessToken: string,
    input: UserPatchInput,
    signal?: AbortSignal,
  ) => Promise<UserProfile>;
  // M17 AV-AC8: U4 (avatar upload intent) and U5 (finalize). Errors surface as
  // AccountApiError(status, code) with the server's stable error.code.
  startAvatarUpload: (
    accessToken: string,
    byteSize: number,
    signal?: AbortSignal,
  ) => Promise<AvatarUploadIntent>;
  finalizeAvatarUpload: (
    accessToken: string,
    uploadId: string,
    signal?: AbortSignal,
  ) => Promise<UserProfile>;
  // An Apple-provider account sends this proof as the DELETE JSON body;
  // Kakao/Google accounts call this with no proof (unchanged bodyless U3).
  deleteAccount: (
    accessToken: string,
    appleProof?: AppleAccountDeletionProof,
    signal?: AbortSignal,
  ) => Promise<void>;
}>;

/**
 * U2's local guard mirrors push-installations-api.ts's validateCreateInput:
 * reject an obviously invalid patch before any network call. The length
 * bound (UserPatch's minLength/maxLength, see NICKNAME_MIN_LENGTH /
 * NICKNAME_MAX_LENGTH) is asserted against the trimmed nickname so the port
 * stays consistent for any caller, not only account-lifecycle.ts which
 * already trims.
 */
function validateUpdateProfileInput(input: UserPatchInput): void {
  if (input.nickname !== undefined) {
    const trimmed = input.nickname.trim();
    if (
      trimmed.length < NICKNAME_MIN_LENGTH ||
      trimmed.length > NICKNAME_MAX_LENGTH
    )
      throw new AccountApiError(422, "invalid_nickname");
  }
  // `""` clears the avatar (U2), a null is normalised to `""` on the wire, and
  // any other value must be a server-valid https URL (<= 512 chars; the https
  // rule itself is enforced server-side as a 422 request_validation_failed).
  if (input.avatarUrl !== undefined && input.avatarUrl !== null) {
    if (input.avatarUrl.length > 512)
      throw new AccountApiError(422, "invalid_avatar_url");
  }
}

/**
 * `mediaOrigin` is the configured object-storage origin (EXPO_PUBLIC_MEDIA_ORIGIN)
 * U4's presigned PUT URL must resolve to, exactly like the chat media flow's
 * `createMediaApi` (media-api.ts): the PUT carries the user's photo to
 * whatever host the URL names, so a response pointing anywhere else is an
 * invalid response. It is optional only for callers that never upload an
 * avatar (the account lifecycle); `startAvatarUpload` fails closed without it.
 */
export function createAccountApi(
  origin: string,
  mediaOrigin?: string,
): AccountApiPort {
  const resolvedMediaOrigin =
    mediaOrigin === undefined ? null : parsePublicMediaOrigin(mediaOrigin);
  const request = createHttpRequester(
    origin,
    (status, code, retryAfterSeconds = null) =>
      new AccountApiError(status, code, retryAfterSeconds),
    (error): error is AccountApiError => error instanceof AccountApiError,
  );

  return {
    async updateProfile(accessToken, input, signal) {
      validateUpdateProfileInput(input);
      const wireBody = userPatchToWire(input);
      const { payload } = await request(
        "/api/v1/me",
        accessToken,
        { method: "PATCH", body: JSON.stringify(wireBody) },
        signal,
        [200],
      );
      if (!validateUser(payload))
        throw new AccountApiError(502, "invalid_profile_response");
      return mapUserProfile(payload);
    },
    async startAvatarUpload(accessToken, byteSize, signal) {
      if (!isValidAvatarByteSize(byteSize))
        throw new AccountApiError(422, "invalid_avatar_size");
      if (resolvedMediaOrigin === null)
        throw new AccountApiError(502, "invalid_media_origin_url");
      const { payload } = await request(
        "/api/v1/me/avatar/uploads",
        accessToken,
        {
          method: "POST",
          body: JSON.stringify(avatarUploadCreateToWire(byteSize)),
        },
        signal,
        [201],
      );
      if (!validateAvatarUploadIntent(payload))
        throw new AccountApiError(502, "invalid_avatar_upload_response");
      // Same HTTPS origin, no userinfo, no fragment (media-transport.ts); the
      // signed URL is otherwise passed on verbatim.
      try {
        requireMediaOriginUrl(payload.presigned_put.url, resolvedMediaOrigin);
      } catch (error) {
        if (error instanceof MediaOriginError)
          throw new AccountApiError(502, "invalid_media_origin_url");
        throw error;
      }
      return mapAvatarUploadIntent(payload);
    },
    async finalizeAvatarUpload(accessToken, uploadId, signal) {
      if (!UUID_PATTERN.test(uploadId))
        throw new AccountApiError(422, "invalid_identifier");
      const body = {};
      if (!validateAvatarUploadFinalize(body))
        throw new AccountApiError(422, "invalid_avatar_finalize");
      const { payload } = await request(
        `/api/v1/me/avatar/uploads/${encodeURIComponent(uploadId)}/finalize`,
        accessToken,
        { method: "POST", body: JSON.stringify(body) },
        signal,
        [200],
      );
      if (!validateUser(payload))
        throw new AccountApiError(502, "invalid_profile_response");
      return mapUserProfile(payload);
    },
    async deleteAccount(accessToken, appleProof, signal) {
      // U3: 409 group_ownership_transfer_required is a distinct blocker code
      // (not a mutation) -- createHttpRequester already surfaces the
      // ErrorEnvelope's code verbatim as AccountApiError(status, code), so no
      // extra remapping is needed here to keep it distinct from request_failed.
      // APPCON-AC5: an Apple proof becomes the JSON body
      // (AppleAccountDeletionProof); Kakao/Google calls stay bodyless,
      // matching the server's existing "reject any body for a non-Apple
      // account" invariant.
      await request(
        "/api/v1/me",
        accessToken,
        {
          method: "DELETE",
          ...(appleProof
            ? {
                body: JSON.stringify({
                  identity_token: appleProof.identityToken,
                  authorization_code: appleProof.authorizationCode,
                  raw_nonce: appleProof.rawNonce,
                }),
              }
            : {}),
        },
        signal,
        [204],
      );
    },
  };
}
