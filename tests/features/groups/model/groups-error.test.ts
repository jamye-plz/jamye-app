import { GroupsApiError } from "@/features/groups/data/groups-api";
import {
  invalidationEffectForError,
  isUncertainMutationOutcome,
  mapGroupsApiError,
} from "@/features/groups/model/groups-error";

describe("mapGroupsApiError (M7 stable G1-G8/I1-I2 status/code mapping)", () => {
  test.each([
    [
      422,
      "request_validation_failed",
      { kind: "validation", code: "request_validation_failed" },
    ],
    [403, "membership_required", { kind: "membership_required" }],
    [403, "owner_required", { kind: "owner_required" }],
    [404, "group_not_found", { kind: "not_found", code: "group_not_found" }],
    [404, "member_not_found", { kind: "not_found", code: "member_not_found" }],
    [404, "invite_not_found", { kind: "not_found", code: "invite_not_found" }],
    [
      409,
      "group_owner_conflict",
      { kind: "conflict", code: "group_owner_conflict" },
    ],
    [409, "group_full", { kind: "conflict", code: "group_full" }],
    [
      409,
      "group_topology_conflict",
      { kind: "conflict", code: "group_topology_conflict" },
    ],
    [
      410,
      "invite_expired",
      { kind: "invite_terminal", code: "invite_expired" },
    ],
    [
      410,
      "invite_exhausted",
      { kind: "invite_terminal", code: "invite_exhausted" },
    ],
    [
      503,
      "rate_limit_unavailable",
      { kind: "service_unavailable", code: "rate_limit_unavailable" },
    ],
    [
      503,
      "groups_unavailable",
      { kind: "service_unavailable", code: "groups_unavailable" },
    ],
    [
      503,
      "database_unavailable",
      { kind: "service_unavailable", code: "database_unavailable" },
    ],
  ])(
    "maps status %s code %s to the documented distinct outcome",
    (status, code, expected) => {
      expect(mapGroupsApiError(new GroupsApiError(status, code))).toEqual(
        expected,
      );
    },
  );

  test("maps 429 to rate_limited carrying the parsed Retry-After seconds", () => {
    expect(
      mapGroupsApiError(new GroupsApiError(429, "rate_limit_exceeded", 7)),
    ).toEqual({ kind: "rate_limited", retryAfterSeconds: 7 });
    expect(
      mapGroupsApiError(new GroupsApiError(429, "rate_limit_exceeded", null)),
    ).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
  });

  test("maps a caller-cancelled request distinctly from every real server error", () => {
    expect(
      mapGroupsApiError(new GroupsApiError(0, "request_cancelled")),
    ).toEqual({ kind: "cancelled" });
  });

  test.each([
    new GroupsApiError(0, "network_unavailable"),
    new GroupsApiError(408, "request_timeout"),
  ])("maps transport failures to network", (error) => {
    expect(mapGroupsApiError(error)).toEqual({ kind: "network" });
  });

  test("maps an undocumented status/code pair to an explicit unknown outcome instead of guessing", () => {
    expect(mapGroupsApiError(new GroupsApiError(451, "teapot"))).toEqual({
      kind: "unknown",
      status: 451,
      code: "teapot",
    });
  });

  test("maps a non-GroupsApiError throwable to network rather than crashing", () => {
    expect(mapGroupsApiError(new Error("boom"))).toEqual({ kind: "network" });
  });
});

describe("isUncertainMutationOutcome", () => {
  test.each([
    { kind: "service_unavailable", code: "groups_unavailable" },
    { kind: "network" },
  ] as const)("treats %o as uncertain", (outcome) => {
    expect(isUncertainMutationOutcome(outcome)).toBe(true);
  });

  test.each([
    { kind: "rate_limited", retryAfterSeconds: null },
    { kind: "membership_required" },
    { kind: "owner_required" },
    { kind: "validation", code: "request_validation_failed" },
    { kind: "not_found", code: "group_not_found" },
    { kind: "cancelled" },
  ] as const)("treats %o as a definite (non-uncertain) outcome", (outcome) => {
    expect(isUncertainMutationOutcome(outcome)).toBe(false);
  });
});

describe("invalidationEffectForError (owner_required vs membership_required)", () => {
  test("membership_required removes the now-inaccessible protected group state", () => {
    expect(invalidationEffectForError({ kind: "membership_required" })).toEqual(
      { kind: "remove_group" },
    );
  });

  test("owner_required only refetches permissions, keeping the group accessible", () => {
    expect(invalidationEffectForError({ kind: "owner_required" })).toEqual({
      kind: "refetch_permissions",
    });
  });

  test.each([
    { kind: "not_found", code: "member_not_found" },
    { kind: "conflict", code: "group_owner_conflict" },
    { kind: "rate_limited", retryAfterSeconds: null },
    { kind: "network" },
  ] as const)("%o has no list/detail invalidation effect", (outcome) => {
    expect(invalidationEffectForError(outcome)).toEqual({ kind: "none" });
  });

  test("a missing group evicts protected group state", () => {
    expect(
      invalidationEffectForError({
        kind: "not_found",
        code: "group_not_found",
      }),
    ).toEqual({ kind: "remove_group" });
  });
});
