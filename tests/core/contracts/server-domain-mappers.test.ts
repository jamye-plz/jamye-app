import {
  isKnownOAuthProvider,
  mapCanonicalChatMessage,
  mapChatMessage,
  mapChatMessagePage,
  mapChatReadMarker,
  mapChatroom,
  mapChatroomPage,
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

  test("C1 maps Chatroom wire fields to camelCase and preserves next_cursor through ChatroomPage", () => {
    const chatroomWire = {
      created_at: "2024-01-01T00:00:00Z",
      group_id: "11111111-1111-4111-8111-111111111111",
      id: "22222222-2222-4222-8222-222222222222",
      topic_id: null,
      type: "main" as const,
    };
    expect(mapChatroom(chatroomWire)).toEqual({
      createdAt: "2024-01-01T00:00:00Z",
      groupId: "11111111-1111-4111-8111-111111111111",
      id: "22222222-2222-4222-8222-222222222222",
      topicId: null,
      type: "main",
    });
    expect(
      mapChatroomPage({ items: [chatroomWire], next_cursor: "opaque-token" }),
    ).toEqual({
      items: [mapChatroom(chatroomWire)],
      nextCursor: "opaque-token",
    });
    expect(
      mapChatroomPage({ items: [], next_cursor: null }).nextCursor,
    ).toBeNull();
  });

  test("C2 maps DenormalizedMessage's nullable sender/nickname/avatar/client_msg_id fields and raw sub-ms timestamp verbatim", () => {
    const messageWire = {
      body: "안녕하세요 😀\n",
      chatroom_id: "11111111-1111-4111-8111-111111111111",
      client_msg_id: "22222222-2222-4222-8222-222222222222",
      created_at: "2024-01-01T00:00:00.123456Z",
      id: "33333333-3333-4333-8333-333333333333",
      media: [
        {
          byte_size: 1024,
          duration: null,
          filename: null,
          height: 100,
          id: "44444444-4444-4444-8444-444444444444",
          media_upload_id: "55555555-5555-4555-8555-555555555555",
          position: 0,
          poster_media_id: null,
          type: "image/png" as const,
          width: 100,
        },
      ],
      sender_avatar_url: null,
      sender_id: "66666666-6666-4666-8666-666666666666",
      sender_nickname: "닉네임",
      type: "user" as const,
    };
    expect(mapChatMessage(messageWire)).toEqual({
      body: "안녕하세요 😀\n",
      chatroomId: "11111111-1111-4111-8111-111111111111",
      clientMessageId: "22222222-2222-4222-8222-222222222222",
      createdAt: "2024-01-01T00:00:00.123456Z",
      id: "33333333-3333-4333-8333-333333333333",
      media: [
        {
          byteSize: 1024,
          duration: null,
          filename: null,
          height: 100,
          id: "44444444-4444-4444-8444-444444444444",
          mediaUploadId: "55555555-5555-4555-8555-555555555555",
          position: 0,
          posterMediaId: null,
          type: "image/png",
          width: 100,
        },
      ],
      senderAvatarUrl: null,
      senderId: "66666666-6666-4666-8666-666666666666",
      senderNickname: "닉네임",
      type: "user",
    });
    expect(
      mapChatMessagePage({ items: [messageWire], next_cursor: "older-token" }),
    ).toEqual({
      items: [mapChatMessage(messageWire)],
      nextCursor: "older-token",
    });
  });

  test("C4 maps CanonicalMessage's absent sparse fields to null without inventing sender nickname/avatar", () => {
    const canonicalWire = {
      chatroom_id: "11111111-1111-4111-8111-111111111111",
      created_at: "2024-01-01T00:00:00.5Z",
      id: "22222222-2222-4222-8222-222222222222",
      media: [],
      type: "user" as const,
    };
    expect(mapCanonicalChatMessage(canonicalWire)).toEqual({
      body: null,
      chatroomId: "11111111-1111-4111-8111-111111111111",
      clientMessageId: null,
      createdAt: "2024-01-01T00:00:00.5Z",
      id: "22222222-2222-4222-8222-222222222222",
      media: [],
      senderId: null,
      type: "user",
    });
    expect(
      mapCanonicalChatMessage({
        ...canonicalWire,
        body: "본문",
        client_msg_id: "33333333-3333-4333-8333-333333333333",
        sender_id: "44444444-4444-4444-8444-444444444444",
      }),
    ).toEqual({
      body: "본문",
      chatroomId: "11111111-1111-4111-8111-111111111111",
      clientMessageId: "33333333-3333-4333-8333-333333333333",
      createdAt: "2024-01-01T00:00:00.5Z",
      id: "22222222-2222-4222-8222-222222222222",
      media: [],
      senderId: "44444444-4444-4444-8444-444444444444",
      type: "user",
    });
  });

  test("C3 maps ReadMarker's last_read_cursor as an opaque decimal string, never a parsed number", () => {
    expect(
      mapChatReadMarker({
        chatroom_id: "11111111-1111-4111-8111-111111111111",
        last_read_cursor: "9007199254740993",
        updated_at: "2024-01-01T00:00:00Z",
      }),
    ).toEqual({
      chatroomId: "11111111-1111-4111-8111-111111111111",
      lastReadCursor: "9007199254740993",
      updatedAt: "2024-01-01T00:00:00Z",
    });
  });
});
