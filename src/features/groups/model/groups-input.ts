import {
  validateGroupCreate,
  validateInviteCreate,
} from "@/core/contracts/server";

export type InviteInput = Readonly<{
  expiresAt?: string | null;
  maxUses?: number | null;
}>;

export function isGroupIdentifier(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function isGroupName(name: string): boolean {
  // AJV counts Unicode code points, unlike TextInput's UTF-16 maxLength.
  return validateGroupCreate({ name });
}

export function isInviteInput(input: InviteInput, now = Date.now()): boolean {
  const expiresAt = input.expiresAt ?? null;
  return (
    validateInviteCreate({
      expires_at: expiresAt,
      max_uses: input.maxUses ?? null,
    }) &&
    (expiresAt === null || Date.parse(expiresAt) > now)
  );
}
