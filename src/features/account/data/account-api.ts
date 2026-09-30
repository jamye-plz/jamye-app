import type { UserProfile } from "@/core/auth/types";
import {
  mapUserProfile,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  userPatchToWire,
  validateUser,
} from "@/core/contracts/server";
import type { UserPatchInput } from "@/core/contracts/server";
import { createHttpRequester } from "@/core/http/http-requester";

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
  if (input.avatarUrl !== undefined && input.avatarUrl !== null) {
    if (input.avatarUrl.length > 512)
      throw new AccountApiError(422, "invalid_avatar_url");
  }
}

export function createAccountApi(origin: string): AccountApiPort {
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
