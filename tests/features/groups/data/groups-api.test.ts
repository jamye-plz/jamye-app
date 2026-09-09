import { createGroupsApi } from "@/features/groups/data/groups-api";
import {
  code,
  group,
  groupId,
  groupWire,
  invite,
  inviteWire,
  member,
  memberWire,
  otherId,
} from "../groups-fixtures";

describe("M7 groups transport", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  const api = createGroupsApi("https://api.example.com/");
  const reply = (
    status: number,
    value: unknown = null,
    retryAfter: string | null = null,
  ) => {
    const json = jest.fn().mockResolvedValue(value);
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json,
      headers: { get: () => retryAfter },
    });
    return json;
  };
  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  test("G1 preserves Unicode scalar name and validates 201 JSON", async () => {
    reply(201, groupWire);
    await expect(
      api.createGroup("test-token", { name: "😀".repeat(128) }),
    ).resolves.toEqual(group);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/groups",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        redirect: "error",
        body: JSON.stringify({ name: "😀".repeat(128) }),
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });
  test("G2 and G4 retain opaque cursors and server ordering", async () => {
    const cursor = "a+/=%? &끝";
    reply(200, { items: [groupWire], next_cursor: cursor });
    await expect(
      api.listGroups("t", { after: cursor, limit: 100 }),
    ).resolves.toEqual({ items: [group], nextCursor: cursor });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("after")).toBe(
      cursor,
    );
    reply(200, { items: [memberWire], next_cursor: cursor });
    await expect(api.listMembers("t", groupId, {})).resolves.toEqual({
      items: [member],
      nextCursor: cursor,
    });
  });
  test("G3 and G5 use exact group paths and return canonical server names", async () => {
    reply(200, groupWire);
    await expect(api.getGroup("t", groupId)).resolves.toEqual(group);
    await expect(
      api.renameGroup("t", groupId, { name: "  이름  " }),
    ).resolves.toEqual(group);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://api.example.com/api/v1/groups/${groupId}`,
      expect.objectContaining({ method: "PATCH", body: '{"name":"  이름  "}' }),
    );
  });
  test("G6 G7 G8 accept only 204 and never parse its body", async () => {
    const json = reply(204);
    await api.deleteGroup("t", groupId);
    await api.removeMember("t", groupId, otherId);
    await api.setMemberRole("t", groupId, otherId, { role: "owner" });
    expect(json).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual([
      "DELETE",
      "DELETE",
      "PATCH",
    ]);
    expect(fetchMock.mock.calls[2][1].body).toBe('{"role":"owner"}');
  });
  test("I1 maps nullable inputs and I2 accepts an already-member result without a body", async () => {
    reply(201, inviteWire);
    await expect(api.createInvite("t", groupId, {})).resolves.toEqual(invite);
    expect(fetchMock.mock.calls[0][1].body).toBe(
      '{"expires_at":null,"max_uses":null}',
    );
    reply(200, { group_id: groupId, membership_id: null, joined: false });
    await expect(api.joinByInvite("t", code)).resolves.toEqual({
      groupId,
      membershipId: null,
      joined: false,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.example.com/api/v1/invites/${code}/join`,
    );
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
  });
  test.each(["", "a".repeat(129)])(
    "rejects invalid names before IO",
    async (name) => {
      await expect(api.createGroup("t", { name })).rejects.toMatchObject({
        status: 422,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  test.each([0, 101, 1.5])(
    "rejects invalid limit %s before IO",
    async (limit) => {
      await expect(api.listGroups("t", { limit })).rejects.toMatchObject({
        status: 422,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  test.each(["..", "../groups", "not-a-uuid"])(
    "rejects malformed group ids %s before IO",
    async (id) => {
      await expect(api.getGroup("t", id)).rejects.toMatchObject({
        status: 422,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  test("rejects standalone member demotion and past invite expiry", async () => {
    // The published schema allows member, but M7 supports atomic owner transfer only.
    await expect(
      api.setMemberRole("t", groupId, otherId, { role: "member" } as never),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      api.createInvite("t", groupId, { expiresAt: "2020-01-01T00:00:00Z" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("validates IDs and positive limits on other mutations too", async () => {
    await expect(api.removeMember("t", groupId, "..")).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      api.createInvite("t", groupId, { maxUses: 0 }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(api.joinByInvite("t", "not/valid")).rejects.toMatchObject({
      status: 422,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("preserves error status, safe code and Retry-After without server text", async () => {
    reply(
      429,
      {
        error: {
          code: "rate_limit_exceeded",
          message: "must not leak",
          request_id: "r",
        },
      },
      "7",
    );
    await expect(api.listGroups("t", {})).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 7,
    });
    reply(403, null);
    await expect(api.getGroup("t", groupId)).rejects.toMatchObject({
      status: 403,
      code: "request_failed",
    });
  });
  test("never logs bearer tokens, invite codes or raw server error details", async () => {
    const spies = ["log", "warn", "error", "info", "debug"] as const;
    const logs = spies.map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      const token = "sensitive-fake-bearer-token";
      reply(201, inviteWire);
      await expect(api.createInvite(token, groupId, {})).resolves.toEqual(
        invite,
      );
      reply(200, { group_id: groupId, membership_id: null, joined: false });
      await api.joinByInvite(token, code);
      reply(503, {
        error: {
          code: "service_unavailable",
          message: "sensitive-raw-server-detail",
          request_id: "fake-request",
        },
      });
      await expect(api.joinByInvite(token, code)).rejects.toMatchObject({
        status: 503,
      });
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    } finally {
      for (const log of logs) log.mockRestore();
    }
  });
  test("rejects malformed or wrong-status success without retry", async () => {
    reply(201, { id: groupId });
    await expect(api.createGroup("t", { name: "이름" })).rejects.toMatchObject({
      status: 502,
    });
    reply(200);
    await expect(api.deleteGroup("t", groupId)).rejects.toMatchObject({
      code: "invalid_response_status",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  test("an already aborted caller causes no IO", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(api.listGroups("t", {}, abort.signal)).rejects.toMatchObject({
      status: 0,
      code: "request_cancelled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("bounds transport wait and releases timeout", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(Object.assign(new Error(), { name: "AbortError" })),
          );
        }),
    );
    const pending = expect(api.listGroups("t", {})).rejects.toMatchObject({
      status: 408,
      code: "request_timeout",
    });
    await jest.advanceTimersByTimeAsync(15000);
    await pending;
    expect(jest.getTimerCount()).toBe(0);
  });
});
