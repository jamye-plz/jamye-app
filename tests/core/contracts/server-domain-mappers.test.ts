import {
  isKnownOAuthProvider,
  mapGroup,
  mapGroupPage,
  mapInvite,
  mapInviteJoinResult,
  mapLiveness,
  mapMember,
  mapMemberPage,
  mapOAuthAuthorization,
  mapReadiness,
  mapTokenPair,
  mapUserProfile,
} from "@/core/contracts/server";

describe("M6-01 server contract domain mappers", () => {
  test("maps liveness and readiness wire payloads to camelCase domain shapes", () => {
    expect(mapLiveness({ status: "live" })).toEqual({ status: "live" });
    expect(
      mapReadiness({
        checks: {
          minio: { required: false, status: "degraded" },
          postgres: { required: true, status: "ready" },
          redis: { required: true, status: "ready" },
        },
        status: "ready",
      }),
    ).toEqual({
      dependencies: {
        minio: { required: false, status: "degraded" },
        postgres: { required: true, status: "ready" },
        redis: { required: true, status: "ready" },
      },
      status: "ready",
    });
  });

  test("maps OAuthAuthorizeOut wire fields to the domain authorization shape", () => {
    expect(
      mapOAuthAuthorization({
        authorization_url: "https://kauth.kakao.com/oauth/authorize",
        expires_in_seconds: 600,
        state: "s".repeat(43),
      }),
    ).toEqual({
      authorizationUrl: "https://kauth.kakao.com/oauth/authorize",
      expiresInSeconds: 600,
      state: "s".repeat(43),
    });
  });

  test("maps TokenPair wire fields onto the existing auth TokenPair domain type", () => {
    expect(
      mapTokenPair({
        access_token: "access",
        access_token_expires_at: "2024-01-01T00:00:00Z",
        refresh_token: "r".repeat(43),
        refresh_token_expires_at: "2024-02-01T00:00:00Z",
        token_type: "Bearer",
      }),
    ).toEqual({
      accessToken: "access",
      accessTokenExpiresAt: "2024-01-01T00:00:00Z",
      refreshToken: "r".repeat(43),
      refreshTokenExpiresAt: "2024-02-01T00:00:00Z",
    });
  });

  test("maps User wire fields onto the existing auth UserProfile domain type", () => {
    expect(
      mapUserProfile({
        avatar_url: null,
        created_at: "2024-01-01T00:00:00Z",
        id: "11111111-1111-4111-8111-111111111111",
        nickname: "nick",
        provider: "google",
      }),
    ).toEqual({
      avatarUrl: null,
      createdAt: "2024-01-01T00:00:00Z",
      id: "11111111-1111-4111-8111-111111111111",
      nickname: "nick",
      provider: "google",
    });
  });

  test("maps Group wire fields to camelCase and preserves next_cursor as an opaque string through GroupPage", () => {
    const groupWire = {
      created_at: "2024-01-01T00:00:00Z",
      id: "11111111-1111-4111-8111-111111111111",
      main_chatroom_id: "22222222-2222-4222-8222-222222222222",
      max_members: 10,
      member_count: 3,
      name: "그룹",
      owner_id: "33333333-3333-4333-8333-333333333333",
    };
    expect(mapGroup(groupWire)).toEqual({
      createdAt: "2024-01-01T00:00:00Z",
      id: "11111111-1111-4111-8111-111111111111",
      mainChatroomId: "22222222-2222-4222-8222-222222222222",
      maxMembers: 10,
      memberCount: 3,
      name: "그룹",
      ownerId: "33333333-3333-4333-8333-333333333333",
    });
    expect(
      mapGroupPage({ items: [groupWire], next_cursor: "opaque-token" }),
    ).toEqual({ items: [mapGroup(groupWire)], nextCursor: "opaque-token" });
    expect(
      mapGroupPage({ items: [], next_cursor: null }).nextCursor,
    ).toBeNull();
  });

  test("maps Member wire fields to camelCase and preserves the membership next_cursor through MemberPage", () => {
    const memberWire = {
      avatar_url: null,
      joined_at: "2024-01-01T00:00:00Z",
      nickname: "n",
      role: "owner" as const,
      user_id: "11111111-1111-4111-8111-111111111111",
    };
    expect(mapMember(memberWire)).toEqual({
      avatarUrl: null,
      joinedAt: "2024-01-01T00:00:00Z",
      nickname: "n",
      role: "owner",
      userId: "11111111-1111-4111-8111-111111111111",
    });
    expect(
      mapMemberPage({ items: [memberWire], next_cursor: "membership-cursor" }),
    ).toEqual({
      items: [mapMember(memberWire)],
      nextCursor: "membership-cursor",
    });
  });

  test("maps Invite wire fields to camelCase without altering the code", () => {
    const inviteWire = {
      code: "a".repeat(16),
      created_at: "2024-01-01T00:00:00Z",
      created_by: "11111111-1111-4111-8111-111111111111",
      expires_at: null,
      group_id: "22222222-2222-4222-8222-222222222222",
      id: "33333333-3333-4333-8333-333333333333",
      max_uses: null,
      used_count: 0,
    };
    expect(mapInvite(inviteWire)).toEqual({
      code: "a".repeat(16),
      createdAt: "2024-01-01T00:00:00Z",
      createdBy: "11111111-1111-4111-8111-111111111111",
      expiresAt: null,
      groupId: "22222222-2222-4222-8222-222222222222",
      id: "33333333-3333-4333-8333-333333333333",
      maxUses: null,
      usedCount: 0,
    });
  });

  test("maps InviteJoinResult's already-member success shape (joined:false, membership_id:null)", () => {
    expect(
      mapInviteJoinResult({
        group_id: "11111111-1111-4111-8111-111111111111",
        joined: false,
        membership_id: null,
      }),
    ).toEqual({
      groupId: "11111111-1111-4111-8111-111111111111",
      joined: false,
      membershipId: null,
    });
    expect(
      mapInviteJoinResult({
        group_id: "11111111-1111-4111-8111-111111111111",
        joined: true,
        membership_id: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      groupId: "11111111-1111-4111-8111-111111111111",
      joined: true,
      membershipId: "22222222-2222-4222-8222-222222222222",
    });
  });

  test("recognizes only the two supported OAuth providers", () => {
    expect(isKnownOAuthProvider("kakao")).toBe(true);
    expect(isKnownOAuthProvider("google")).toBe(true);
    expect(isKnownOAuthProvider("apple")).toBe(false);
  });
});
