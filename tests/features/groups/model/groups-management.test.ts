import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import {
  deferred,
  fakeGroupsApi,
  group,
  groupId,
  invite,
  otherId,
  principal,
  userId,
} from "../groups-fixtures";

const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);
describe("M7 owner and member operations", () => {
  async function setup(owner = true) {
    const api = fakeGroupsApi();
    if (!owner) api.getGroup.mockResolvedValue({ ...group, ownerId: otherId });
    const store = createGroupsStore({ createApi: () => api });
    store.setPrincipal(principal, authorized);
    await store.actions.loadGroups();
    await store.actions.openGroup(groupId);
    return { api, store, actions: store.actions };
  }
  test("owner transfer sends only owner and refetches group and roster", async () => {
    const { api, actions, store } = await setup();
    api.getGroup.mockResolvedValue({ ...group, ownerId: otherId });
    await expect(actions.transferOwnership(otherId)).resolves.toBe(true);
    expect(api.setMemberRole).toHaveBeenCalledWith(
      "fake",
      groupId,
      otherId,
      { role: "owner" },
      expect.anything(),
    );
    expect(store.getState().detail.group?.ownerId).toBe(otherId);
    expect(api.listMembers).toHaveBeenCalledTimes(2);
    expect(api.listGroups).toHaveBeenCalledTimes(2);
  });
  test("owner cannot leave before transferring, member can leave and clears protected state", async () => {
    const owner = await setup();
    await expect(owner.actions.removeMember(userId)).resolves.toBe(false);
    expect(owner.api.removeMember).not.toHaveBeenCalled();
    const member = await setup(false);
    await expect(member.actions.removeMember(userId)).resolves.toBe(true);
    expect(member.store.getState().detail).toMatchObject({
      group: null,
      accessLost: true,
    });
  });
  test("nonowner management fails without IO but self-leave stays available", async () => {
    const { api, actions } = await setup(false);
    await actions.renameGroup("새 이름");
    await actions.deleteGroup();
    await actions.transferOwnership(otherId);
    await actions.removeMember(otherId);
    await actions.createInvite({});
    expect(api.renameGroup).not.toHaveBeenCalled();
    expect(api.deleteGroup).not.toHaveBeenCalled();
    expect(api.createInvite).not.toHaveBeenCalled();
    expect(api.setMemberRole).not.toHaveBeenCalled();
    expect(api.removeMember).not.toHaveBeenCalled();
  });
  test("pending management rejects duplicate and competing mutations", async () => {
    const { api, actions } = await setup();
    const pending = deferred<typeof group>();
    api.renameGroup.mockReturnValueOnce(pending.promise);
    const renamed = actions.renameGroup("새 이름");
    await actions.renameGroup("다른 이름");
    await actions.deleteGroup();
    await actions.createInvite({});
    expect(api.renameGroup).toHaveBeenCalledTimes(1);
    expect(api.deleteGroup).not.toHaveBeenCalled();
    expect(api.createInvite).not.toHaveBeenCalled();
    pending.resolve(group);
    await renamed;
  });
  test("owner_required refreshes permissions without removing membership", async () => {
    const { api, actions, store } = await setup();
    api.renameGroup.mockRejectedValueOnce(
      new GroupsApiError(403, "owner_required"),
    );
    api.getGroup.mockResolvedValue({ ...group, ownerId: otherId });
    await actions.renameGroup("이름");
    expect(store.getState().detail.group?.ownerId).toBe(otherId);
    expect(store.getState().detail.accessLost).toBe(false);
    expect(store.getState().management).toMatchObject({
      status: "failed",
      error: { kind: "owner_required" },
    });
  });
  test.each([
    [403, "membership_required"],
    [404, "group_not_found"],
  ] as const)(
    "loss of group access removes list and roster %s",
    async (status, code) => {
      const { api, actions, store } = await setup();
      api.renameGroup.mockRejectedValueOnce(new GroupsApiError(status, code));
      await actions.renameGroup("이름");
      expect(store.getState().detail.group).toBeNull();
      expect(store.getState().detail.members.items).toEqual([]);
      expect(store.getState().list.items).toEqual([]);
    },
  );
  test("unknown invite issuance is never replayed without explicit confirmation, even after leaving", async () => {
    const { api, actions, store } = await setup();
    api.createInvite.mockRejectedValueOnce(
      new GroupsApiError(502, "invalid_invite_response"),
    );
    await actions.createInvite({});
    await actions.createInvite({});
    expect(api.createInvite).toHaveBeenCalledTimes(1);
    actions.closeGroup();
    await actions.openGroup(groupId);
    await actions.createInvite({});
    expect(api.createInvite).toHaveBeenCalledTimes(1);
    expect(store.getState().inviteUncertain).toBe(true);
    await actions.createInvite({}, true);
    expect(store.getState().invite).toEqual(invite);
  });
  test("invite is ephemeral and late issuance after background never restores code", async () => {
    const { api, actions, store } = await setup();
    await actions.createInvite({});
    expect(store.getState().invite).toEqual(invite);
    actions.clearInvite();
    expect(store.getState().invite).toBeNull();
    const pending = deferred<typeof invite>();
    api.createInvite.mockReturnValueOnce(pending.promise);
    const issued = actions.createInvite({});
    actions.background();
    pending.resolve(invite);
    await issued;
    expect(store.getState().invite).toBeNull();
    expect(store.getState().inviteUncertain).toBe(true);
    await actions.foreground();
    expect(api.createInvite).toHaveBeenCalledTimes(2);
  });
  test("removing a member and deleting a group refresh only affected resources", async () => {
    const { api, actions, store } = await setup();
    await actions.removeMember(otherId);
    expect(api.listMembers).toHaveBeenCalledTimes(2);
    await actions.deleteGroup();
    expect(store.getState().detail.accessLost).toBe(true);
    expect(api.deleteGroup).toHaveBeenCalledTimes(1);
  });
  test("invalid invite/date/name/member inputs stop before transport", async () => {
    const { api, actions } = await setup();
    await actions.renameGroup("");
    await actions.createInvite({ maxUses: -1 });
    await actions.createInvite({ expiresAt: "2020-01-01T00:00:00Z" });
    await actions.transferOwnership("..");
    expect(api.renameGroup).not.toHaveBeenCalled();
    expect(api.createInvite).not.toHaveBeenCalled();
    expect(api.setMemberRole).not.toHaveBeenCalled();
  });
  test("account change fences management and never refetches with the old mutation's identity", async () => {
    const { api, actions, store } = await setup();
    const pending = deferred<void>();
    api.deleteGroup.mockReturnValueOnce(pending.promise);
    const deleted = actions.deleteGroup();
    store.setPrincipal({ ...principal, userId: otherId }, authorized);
    pending.resolve();
    await expect(deleted).resolves.toBe(false);
    expect(api.listGroups).toHaveBeenCalledTimes(1);
    expect(store.getState().detail.status).toBe("idle");
  });
  test("invite Retry-After cannot be bypassed by route reopen or confirmed extra issuance", async () => {
    jest.useFakeTimers();
    try {
      const { api, actions, store } = await setup();
      api.createInvite.mockRejectedValueOnce(
        new GroupsApiError(429, "rate_limit_exceeded", 2),
      );
      await actions.createInvite({});
      actions.closeGroup();
      await actions.openGroup(groupId);
      await actions.createInvite({}, true);
      expect(api.createInvite).toHaveBeenCalledTimes(1);
      expect(store.getState().inviteUncertain).toBe(false);
      jest.advanceTimersByTime(2000);
      expect(api.createInvite).toHaveBeenCalledTimes(1);
      await actions.createInvite({});
      expect(api.createInvite).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
  test.each([
    [403, "membership_required"],
    [404, "group_not_found"],
  ] as const)(
    "terminal revocation fences a late invite %s",
    async (status, code) => {
      const { api, actions, store } = await setup();
      const pending = deferred<typeof invite>();
      api.createInvite.mockReturnValueOnce(pending.promise);
      const issued = actions.createInvite({});
      api.getGroup.mockRejectedValueOnce(new GroupsApiError(status, code));
      await actions.openGroup(groupId);
      pending.resolve(invite);
      await expect(issued).resolves.toBe(false);
      expect(store.getState().detail.accessLost).toBe(true);
      expect(store.getState().invite).toBeNull();
    },
  );
});
