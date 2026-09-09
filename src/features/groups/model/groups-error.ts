import { GroupsApiError } from "../data/groups-api";

export type GroupsErrorOutcome =
  | Readonly<{ kind: "validation"; code: string }>
  | Readonly<{ kind: "membership_required" }>
  | Readonly<{ kind: "owner_required" }>
  | Readonly<{
      kind: "not_found";
      code: "group_not_found" | "member_not_found" | "invite_not_found";
    }>
  | Readonly<{
      kind: "conflict";
      code: "group_owner_conflict" | "group_full" | "group_topology_conflict";
    }>
  | Readonly<{
      kind: "invite_terminal";
      code: "invite_expired" | "invite_exhausted";
    }>
  | Readonly<{ kind: "rate_limited"; retryAfterSeconds: number | null }>
  | Readonly<{ kind: "service_unavailable"; code: string }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "network" }>
  | Readonly<{ kind: "unknown"; status: number; code: string }>;

const NOT_FOUND_CODES = new Set([
  "group_not_found",
  "member_not_found",
  "invite_not_found",
]);
const CONFLICT_CODES = new Set([
  "group_owner_conflict",
  "group_full",
  "group_topology_conflict",
]);
const INVITE_TERMINAL_CODES = new Set(["invite_expired", "invite_exhausted"]);

/**
 * Maps every stable G1-G8/I1-I2 HTTP status/code pair (plus transport
 * failure modes) to a typed outcome. Keyed only on status/code, never on
 * which of the ten operations produced it, so the same classification and
 * the invalidation effects derived from it are reusable by every group
 * mutation, including ones a later task wires against this same adapter.
 */
export function mapGroupsApiError(error: unknown): GroupsErrorOutcome {
  if (!(error instanceof GroupsApiError)) return { kind: "network" };
  if (error.code === "request_cancelled") return { kind: "cancelled" };
  if (error.status === 0 || error.status === 408) return { kind: "network" };
  if (error.status === 403 && error.code === "membership_required")
    return { kind: "membership_required" };
  if (error.status === 403 && error.code === "owner_required")
    return { kind: "owner_required" };
  if (
    error.status === 404 &&
    NOT_FOUND_CODES.has(error.code as "group_not_found")
  )
    return {
      kind: "not_found",
      code: error.code as
        "group_not_found" | "member_not_found" | "invite_not_found",
    };
  if (
    error.status === 409 &&
    CONFLICT_CODES.has(error.code as "group_owner_conflict")
  )
    return {
      kind: "conflict",
      code: error.code as
        "group_owner_conflict" | "group_full" | "group_topology_conflict",
    };
  if (
    error.status === 410 &&
    INVITE_TERMINAL_CODES.has(error.code as "invite_expired")
  )
    return {
      kind: "invite_terminal",
      code: error.code as "invite_expired" | "invite_exhausted",
    };
  if (error.status === 429)
    return { kind: "rate_limited", retryAfterSeconds: error.retryAfterSeconds };
  if (error.status === 503)
    return { kind: "service_unavailable", code: error.code };
  if (error.status === 422) return { kind: "validation", code: error.code };
  return { kind: "unknown", status: error.status, code: error.code };
}

/**
 * 503/network/timeout leave a create-style mutation's server-side effect
 * genuinely unknown: the request may have been applied before the response
 * was lost. These outcomes must never trigger a blind automatic replay, and
 * a plain list refetch can never prove or disprove which attempt succeeded.
 */
export function isUncertainMutationOutcome(
  outcome: GroupsErrorOutcome,
): boolean {
  return (
    outcome.kind === "service_unavailable" ||
    outcome.kind === "network" ||
    (outcome.kind === "unknown" && outcome.status >= 500)
  );
}

/** A validated 429 is a rejection; its deadline never schedules a retry. */
export function retryAfterDeadline(outcome: GroupsErrorOutcome): number {
  return outcome.kind === "rate_limited" && outcome.retryAfterSeconds !== null
    ? Math.min(
        Number.MAX_SAFE_INTEGER,
        Date.now() + outcome.retryAfterSeconds * 1000,
      )
    : 0;
}

export type GroupsInvalidationEffect =
  | Readonly<{ kind: "remove_group" }>
  | Readonly<{ kind: "refetch_permissions" }>
  | Readonly<{ kind: "none" }>;

/**
 * membership_required means the caller lost access entirely: the protected
 * group state must be removed. owner_required means management permission
 * was lost while membership is intact: the authoritative entity should be
 * refetched, not evicted. These stay distinct outcomes with distinct effects
 * on purpose; do not collapse them into one "forbidden" case.
 */
export function invalidationEffectForError(
  outcome: GroupsErrorOutcome,
): GroupsInvalidationEffect {
  if (
    outcome.kind === "membership_required" ||
    (outcome.kind === "not_found" && outcome.code === "group_not_found")
  )
    return { kind: "remove_group" };
  if (outcome.kind === "owner_required") return { kind: "refetch_permissions" };
  return { kind: "none" };
}
