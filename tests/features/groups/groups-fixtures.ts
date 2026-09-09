import { mapGroup, mapInvite, mapMember } from "@/core/contracts/server";
import type { GroupsApi } from "@/features/groups/data/groups-api";

export const groupId = "11111111-1111-4111-8111-111111111111";
export const userId = "22222222-2222-4222-8222-222222222222";
export const otherId = "33333333-3333-4333-8333-333333333333";
export const code = "test_invite_code_1234";
export const groupWire = {
  id: groupId,
  name: "우리 그룹",
  owner_id: userId,
  member_count: 2,
  max_members: 10,
  main_chatroom_id: otherId,
  created_at: "2024-01-01T00:00:00Z",
};
export const memberWire = {
  user_id: userId,
  nickname: "사용자",
  avatar_url: null,
  role: "owner" as const,
  joined_at: "2024-01-01T00:00:00Z",
};
export const inviteWire = {
  id: otherId,
  group_id: groupId,
  code,
  created_by: userId,
  created_at: "2024-01-01T00:00:00Z",
  expires_at: null,
  max_uses: null,
  used_count: 0,
};
export const group = mapGroup(groupWire);
export const member = mapMember(memberWire);
export const invite = mapInvite(inviteWire);
export const principal = {
  origin: "https://api.example.com",
  userId,
  epoch: 1,
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A RED implementation may not consume the injected promise at all.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

export function fakeGroupsApi(): jest.Mocked<GroupsApi> {
  return {
    createGroup: jest.fn().mockResolvedValue(group),
    listGroups: jest
      .fn()
      .mockResolvedValue({ items: [group], nextCursor: null }),
    getGroup: jest.fn().mockResolvedValue(group),
    listMembers: jest
      .fn()
      .mockResolvedValue({ items: [member], nextCursor: null }),
    renameGroup: jest.fn().mockResolvedValue({ ...group, name: "새 이름" }),
    deleteGroup: jest.fn().mockResolvedValue(undefined),
    removeMember: jest.fn().mockResolvedValue(undefined),
    setMemberRole: jest.fn().mockResolvedValue(undefined),
    createInvite: jest.fn().mockResolvedValue(invite),
    joinByInvite: jest
      .fn()
      .mockResolvedValue({ groupId, joined: false, membershipId: null }),
  };
}
