import type { GroupPage } from "@/core/contracts/server";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";
import {
  code,
  deferred,
  fakeGroupsApi,
  group,
  groupId,
  otherId,
  principal,
} from "../groups-fixtures";

const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake-token", signal ?? new AbortController().signal);

describe("M7 account-scoped groups state", () => {
  function setup() {
    const api = fakeGroupsApi();
    const createApi = jest.fn(() => api);
    const store = createGroupsStore({ createApi });
    store.setPrincipal(principal, authorized);
    return { api, createApi, store, actions: store.actions };
  }
  test("does not fetch until asked, and an equivalent principal keeps state", async () => {
    const { api, store, actions, createApi } = setup();
    expect(api.listGroups).not.toHaveBeenCalled();
    await actions.loadGroups();
    const state = store.getState();
    store.setPrincipal(
      { ...principal, origin: principal.origin + "/" },
      authorized,
    );
    expect(store.getState()).toBe(state);
    expect(createApi).toHaveBeenCalledTimes(1);
  });
  test.each([
    { userId: otherId },
    { origin: "https://other.example.com" },
    { epoch: 2 },
  ])(
    "clears state, aborts and fences late work on principal change %o",
    async (change) => {
      const { api, store, actions, createApi } = setup();
      const page = deferred<GroupPage>();
      api.listGroups.mockReturnValueOnce(page.promise);
      const loading = actions.loadGroups();
      const signal = api.listGroups.mock.calls[0][2]!;
      store.setPrincipal({ ...principal, ...change }, authorized);
      expect(signal.aborted).toBe(true);
      expect(store.getState().list.status).toBe("idle");
      page.resolve({ items: [group], nextCursor: null });
      await loading;
      expect(store.getState().list.items).toEqual([]);
      expect(createApi).toHaveBeenLastCalledWith(
        change.origin ?? principal.origin,
      );
    },
  );
  test("a refreshed first page wins over a late load-more; cursors are opaque", async () => {
    const { api, store, actions } = setup();
    api.listGroups.mockResolvedValueOnce({
      items: [group],
      nextCursor: "x+/=%",
    });
    await actions.loadGroups();
    const next = deferred<GroupPage>();
    api.listGroups.mockReturnValueOnce(next.promise);
    const more = actions.loadMoreGroups();
    await actions.loadMoreGroups();
    expect(api.listGroups.mock.calls[1][1]).toEqual({ after: "x+/=%" });
    api.listGroups.mockResolvedValueOnce({ items: [], nextCursor: null });
    await actions.loadGroups();
    next.resolve({ items: [group], nextCursor: null });
    await more;
    expect(store.getState().list).toMatchObject({
      status: "ready",
      items: [],
      nextCursor: null,
      loadingMore: false,
    });
    expect(api.listGroups).toHaveBeenCalledTimes(3);
  });
  test("same-group refresh retains confirmed content on a transient failure", async () => {
    const { api, store, actions } = setup();
    await actions.openGroup(groupId);
    const previous = store.getState().detail;
    const response = deferred<typeof group>();
    api.getGroup.mockReturnValueOnce(response.promise);
    const refreshing = actions.openGroup(groupId);
    const duringRefresh = store.getState().detail;
    response.reject(new GroupsApiError(503, "group_unavailable"));
    await refreshing;
    expect(duringRefresh.group).toEqual(group);
    expect(duringRefresh.members.items).toEqual(previous.members.items);
    expect(store.getState().detail).toMatchObject({
      status: "error",
      group,
      members: { items: previous.members.items },
      accessLost: false,
    });
    await actions.openGroup(groupId);
    expect(store.getState().detail).toMatchObject({
      status: "ready",
      error: null,
    });
  });
  test("opening a different group never retains the previous protected content", async () => {
    const { api, store, actions } = setup();
    await actions.openGroup(groupId);
    const response = deferred<typeof group>();
    api.getGroup.mockReturnValueOnce(response.promise);
    const opening = actions.openGroup(otherId);
    const whileOpening = store.getState().detail;
    response.reject(new GroupsApiError(503, "group_unavailable"));
    await opening;
    expect(whileOpening).toMatchObject({
      id: otherId,
      group: null,
      members: { items: [] },
    });
    expect(store.getState().detail).toMatchObject({
      id: otherId,
      group: null,
      members: { items: [] },
    });
  });
  test.each([
    [403, "membership_required"],
    [404, "group_not_found"],
  ])(
    "same-group refresh still clears content after %s %s",
    async (status, code) => {
      const { api, store, actions } = setup();
      await actions.openGroup(groupId);
      api.getGroup.mockRejectedValueOnce(new GroupsApiError(status, code));
      await actions.openGroup(groupId);
      expect(store.getState().detail).toMatchObject({
        group: null,
        members: { items: [] },
        accessLost: true,
      });
    },
  );
  test("pagination preserves order, deduplicates overlap and preserves previous data on failure", async () => {
    const { api, store, actions } = setup();
    api.listGroups.mockResolvedValueOnce({
      items: [group],
      nextCursor: "next",
    });
    await actions.loadGroups();
    api.listGroups.mockRejectedValueOnce(
      new GroupsApiError(503, "groups_unavailable"),
    );
    await actions.loadMoreGroups();
    expect(store.getState().list.items).toEqual([group]);
    expect(store.getState().list.error?.kind).toBe("service_unavailable");
    api.listGroups.mockResolvedValueOnce({
      items: [group, { ...group, id: otherId }],
      nextCursor: null,
    });
    await actions.loadMoreGroups();
    expect(store.getState().list.items.map((item) => item.id)).toEqual([
      groupId,
      otherId,
    ]);
  });
  test("create locks duplicate taps and requires confirmed repeat after an unknown result", async () => {
    const { api, store, actions } = setup();
    const pending = deferred<typeof group>();
    api.createGroup.mockReturnValueOnce(pending.promise);
    const first = actions.createGroup("이름");
    await actions.createGroup("이름");
    pending.reject(new GroupsApiError(408, "request_timeout"));
    await first;
    expect(store.getState().createGroup.status).toBe("uncertain");
    await actions.createGroup("이름");
    expect(api.createGroup).toHaveBeenCalledTimes(1);
    expect(api.listGroups).toHaveBeenCalledTimes(1);
    await actions.createGroup("이름", true);
    expect(api.createGroup).toHaveBeenCalledTimes(2);
    expect(api.listGroups).toHaveBeenCalledTimes(2);
  });
  test("already-member join waits for G3 before success and invalidates G2", async () => {
    const { api, store, actions } = setup();
    const detail = deferred<typeof group>();
    api.getGroup.mockReturnValueOnce(detail.promise);
    const joining = actions.joinByInvite(code);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().joinByInvite.status).toBe("pending");
    detail.resolve(group);
    await expect(joining).resolves.toEqual({
      groupId,
      joined: false,
      membershipId: null,
    });
    expect(api.getGroup).toHaveBeenCalledWith(
      "fake-token",
      groupId,
      expect.anything(),
    );
    expect(api.listGroups).toHaveBeenCalledTimes(1);
  });
  test("failed G3 after join never returns a navigable result", async () => {
    const { api, actions, store } = setup();
    api.getGroup.mockRejectedValueOnce(
      new GroupsApiError(403, "membership_required"),
    );
    await expect(actions.joinByInvite(code)).resolves.toBeNull();
    expect(store.getState().joinByInvite).toMatchObject({
      status: "failed",
      error: { kind: "membership_required" },
    });
  });
  test("terminal access loss removes group and roster, unlike a transient error", async () => {
    const { api, actions, store } = setup();
    await actions.loadGroups();
    await actions.openGroup(groupId);
    expect(store.getState().detail.members.items).toHaveLength(1);
    api.getGroup.mockRejectedValueOnce(
      new GroupsApiError(404, "group_not_found"),
    );
    await actions.openGroup(groupId);
    expect(store.getState().detail).toMatchObject({
      group: null,
      accessLost: true,
    });
    expect(store.getState().detail.members.items).toEqual([]);
    expect(store.getState().list.items).toEqual([]);
  });
  test("logout cancels a join and makes its late result non-navigable", async () => {
    const { api, store, actions } = setup();
    const result = deferred<{
      groupId: string;
      joined: boolean;
      membershipId: null;
    }>();
    api.joinByInvite.mockReturnValueOnce(result.promise);
    const joining = actions.joinByInvite(code);
    store.setPrincipal(null, null);
    result.resolve({ groupId, joined: false, membershipId: null });
    await expect(joining).resolves.toBeNull();
    expect(api.getGroup).not.toHaveBeenCalled();
    expect(store.getState().joinByInvite.status).toBe("idle");
  });
  test("Retry-After survives form reset and blocks join until a new eligible user attempt", async () => {
    jest.useFakeTimers();
    try {
      const { api, actions } = setup();
      api.joinByInvite.mockRejectedValueOnce(
        new GroupsApiError(429, "rate_limit_exceeded", 3),
      );
      await actions.joinByInvite(code);
      actions.resetJoinByInvite();
      await actions.joinByInvite(code);
      expect(api.joinByInvite).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(3000);
      expect(api.joinByInvite).toHaveBeenCalledTimes(1);
      await actions.joinByInvite(code);
      expect(api.joinByInvite).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
  test("an unknown create reconciles G2 before a separately confirmed repeat", async () => {
    const { api, actions } = setup();
    api.createGroup.mockRejectedValueOnce(
      new GroupsApiError(503, "groups_unavailable"),
    );
    await actions.createGroup("이름");
    expect(api.listGroups).toHaveBeenCalledTimes(1);
    expect(api.createGroup).toHaveBeenCalledTimes(1);
  });
  test("terminal revocation invalidates a previously started list page", async () => {
    const { api, actions, store } = setup();
    await actions.loadGroups();
    const page = deferred<GroupPage>();
    api.listGroups.mockReturnValueOnce(page.promise);
    const loading = actions.loadGroups();
    api.getGroup.mockRejectedValueOnce(
      new GroupsApiError(403, "membership_required"),
    );
    await actions.openGroup(groupId);
    page.resolve({ items: [group], nextCursor: "late-cursor" });
    await loading;
    expect(store.getState().list.items).toEqual([]);
    expect(store.getState().list.status).not.toBe("loading");
    expect(store.getState().detail.accessLost).toBe(true);
  });
});
