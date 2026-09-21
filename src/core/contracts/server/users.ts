import type { UserPatchWire } from "./validators";

/**
 * U2's UserPatch request body. `nickname` is deliberately a non-nullable
 * string: User.nickname is a required 1..64 field server-side, so a client
 * never intends to send `nickname: null` (that would be a schema-invalid
 * clearing of a required field, not a real UserPatch use case). `avatarUrl`
 * is the one field that can be explicitly cleared: `null` means "clear the
 * avatar", `undefined` means "leave it untouched" (omit the key entirely).
 */

/**
 * Single source of truth for the server contract's `User.nickname` length
 * bound (1..64, see the UserPatchInput doc above). UI, lifecycle and API
 * layers each import these instead of redeclaring the same magic number, so
 * a server schema change only needs to update this one place.
 */
export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 64;

export type UserPatchInput = Readonly<{
  nickname?: string;
  avatarUrl?: string | null;
}>;

/**
 * Mirrors push-installations.ts's expoInstallationCreateToWire pattern: only
 * the keys the caller actually set on UserPatchInput are included on the
 * wire body, matching UserPatch's optional-field semantics (an omitted key
 * on the wire is never sent as an unintended null/empty overwrite).
 */
export function userPatchToWire(input: UserPatchInput): UserPatchWire {
  return {
    ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
    ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
  };
}
