import type { UserPatchWire } from "./validators";

/**
 * U2's UserPatch request body. `nickname` is deliberately a non-nullable
 * string: User.nickname is a required 1..64 field server-side, so a client
 * never intends to send `nickname: null`.
 *
 * `avatarUrl` follows the server's U2 rules (application/users validate_patch):
 * `""` clears the avatar (and queues a server-hosted object for deletion), a
 * valid https URL (<= 512 chars, no control characters) sets it, anything else
 * is a 422 request_validation_failed, and an omitted key OR an explicit
 * `null` is a server-side NO-OP ("leave unchanged"). Clearing must therefore
 * send `""`, never `null` (AV-AC1). The M17 avatar upload sets the avatar
 * through U4/U5 instead, so the app only uses this field to clear it.
 */

/**
 * Single source of truth for the server contract's `User.nickname` length
 * bound (1..64, see the UserPatchInput doc above). UI, lifecycle and API
 * layers each import these instead of redeclaring the same magic number, so
 * a server schema change only needs to update this one place.
 */
export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 64;

/** The only value U2 treats as "clear the avatar" (null is a no-op). */
export const AVATAR_CLEAR_VALUE = "";

export type UserPatchInput = Readonly<{
  nickname?: string;
  /**
   * `""` ({@link AVATAR_CLEAR_VALUE}) clears the avatar. `null` is accepted
   * only so the account lifecycle's structural port type (which still allows
   * it) keeps type-checking; `userPatchToWire` normalises it to `""` so null
   * is never sent.
   */
  avatarUrl?: string | null;
}>;

/**
 * Mirrors push-installations.ts's expoInstallationCreateToWire pattern: only
 * the keys the caller actually set on UserPatchInput are included on the
 * wire body, matching UserPatch's optional-field semantics (an omitted key
 * on the wire is never sent as an unintended overwrite). A null avatarUrl is
 * written as "" because the server ignores null.
 */
export function userPatchToWire(input: UserPatchInput): UserPatchWire {
  return {
    ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
    ...(input.avatarUrl !== undefined
      ? { avatar_url: input.avatarUrl ?? AVATAR_CLEAR_VALUE }
      : {}),
  };
}
