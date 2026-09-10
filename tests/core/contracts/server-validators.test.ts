import {
  isValidInviteJoinCode,
  parseOAuthCallbackQuery,
  validateCanonicalMessage,
  validateChatroom,
  validateChatroomPage,
  validateDenormalizedMessage,
  validateDenormalizedMessagePage,
  validateErrorEnvelope,
  validateGroup,
  validateGroupCreate,
  validateGroupPage,
  validateGroupPatch,
  validateInvite,
  validateInviteCreate,
  validateInviteJoinResult,
  validateLivenessResponse,
  validateMember,
  validateMemberPage,
  validateMemberRolePatch,
  validateMessageCreate,
  validateOAuthAuthorizeIn,
  validateOAuthAuthorizeOut,
  validateOAuthExchangeIn,
  validateReadCursorIn,
  validateReadinessResponse,
  validateReadMarker,
  validateRefreshIn,
  validateTokenPair,
  validateUser,
} from "@/core/contracts/server";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_DATE_TIME = "2024-01-01T00:00:00Z";
const STATE = "s".repeat(43);
const VERIFIER = "v".repeat(43);

describe("M6-01 server contract runtime validators", () => {
  test("H1 liveness accepts only the live enum", () => {
    expect(validateLivenessResponse({ status: "live" })).toBe(true);
    expect(validateLivenessResponse({ status: "dead" })).toBe(false);
    expect(validateLivenessResponse({})).toBe(false);
  });

  test("H2 readiness types the 503 payload the same as the 200 payload", () => {
    const readyBody = {
      checks: {
        minio: { required: false, status: "degraded" },
        postgres: { required: true, status: "ready" },
        redis: { required: true, status: "ready" },
      },
      status: "ready",
    };
    const notReadyBody = {
      ...readyBody,
      checks: {
        ...readyBody.checks,
        postgres: { required: true, status: "unavailable" },
      },
      status: "not_ready",
    };
    expect(validateReadinessResponse(readyBody)).toBe(true);
    expect(validateReadinessResponse(notReadyBody)).toBe(true);
    expect(
      validateReadinessResponse({
        ...readyBody,
        checks: { ...readyBody.checks, postgres: undefined },
      }),
    ).toBe(false);
    expect(validateReadinessResponse({ ...readyBody, status: "unknown" })).toBe(
      false,
    );
  });

  test("A1 OAuthAuthorizeIn enforces the S256 PKCE constraints", () => {
    const valid = {
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
      redirect_uri: "https://api.example/callback",
    };
    expect(validateOAuthAuthorizeIn(valid)).toBe(true);
    expect(
      validateOAuthAuthorizeIn({ ...valid, code_challenge_method: "plain" }),
    ).toBe(false);
    expect(
      validateOAuthAuthorizeIn({ ...valid, code_challenge: "too-short" }),
    ).toBe(false);
    expect(validateOAuthAuthorizeIn({ ...valid, extra: "field" })).toBe(false);
    const { redirect_uri: _redirectUri, ...missingRedirect } = valid;
    expect(validateOAuthAuthorizeIn(missingRedirect)).toBe(false);
  });

  test("A1 OAuthAuthorizeOut requires the fixed 600-second TTL and 43-char state", () => {
    const valid = {
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
      expires_in_seconds: 600,
      state: STATE,
    };
    expect(validateOAuthAuthorizeOut(valid)).toBe(true);
    expect(
      validateOAuthAuthorizeOut({ ...valid, expires_in_seconds: 300 }),
    ).toBe(false);
    expect(validateOAuthAuthorizeOut({ ...valid, state: "too-short" })).toBe(
      false,
    );
    expect(
      validateOAuthAuthorizeOut({ ...valid, authorization_url: "not-a-url" }),
    ).toBe(false);
  });

  test("A2 OAuthExchangeIn enforces the PKCE verifier length and charset", () => {
    const valid = {
      authorization_code: "code",
      code_verifier: VERIFIER,
      redirect_uri: "https://api.example/callback",
      state: STATE,
    };
    expect(validateOAuthExchangeIn(valid)).toBe(true);
    expect(validateOAuthExchangeIn({ ...valid, code_verifier: "short" })).toBe(
      false,
    );
    expect(
      validateOAuthExchangeIn({ ...valid, code_verifier: `${VERIFIER}!` }),
    ).toBe(false);
    expect(validateOAuthExchangeIn({ ...valid, state: "bad-state" })).toBe(
      false,
    );
  });

  test("A2/A3 TokenPair rejects malformed date-time and non-Bearer token types", () => {
    const valid = {
      access_token: "access",
      access_token_expires_at: VALID_DATE_TIME,
      refresh_token: "r".repeat(43),
      refresh_token_expires_at: VALID_DATE_TIME,
      token_type: "Bearer",
    };
    expect(validateTokenPair(valid)).toBe(true);
    expect(validateTokenPair({ ...valid, token_type: "Basic" })).toBe(false);
    expect(
      validateTokenPair({ ...valid, access_token_expires_at: "not-a-date" }),
    ).toBe(false);
    expect(
      validateTokenPair({
        ...valid,
        access_token_expires_at: "2024-13-40T00:00:00Z",
      }),
    ).toBe(false);
    expect(validateTokenPair({ ...valid, refresh_token: "too-short" })).toBe(
      false,
    );
  });

  test("A3 RefreshIn requires the exact 43-character refresh token shape", () => {
    expect(validateRefreshIn({ refresh_token: "r".repeat(43) })).toBe(true);
    expect(validateRefreshIn({ refresh_token: "short" })).toBe(false);
    expect(validateRefreshIn({})).toBe(false);
  });

  test("U1 User rejects malformed UUID and enforces the provider enum plus additionalProperties", () => {
    const valid = {
      avatar_url: null,
      created_at: VALID_DATE_TIME,
      id: VALID_UUID,
      nickname: "n",
      provider: "kakao",
    };
    expect(validateUser(valid)).toBe(true);
    expect(validateUser({ ...valid, id: "not-a-uuid" })).toBe(false);
    expect(validateUser({ ...valid, provider: "apple" })).toBe(false);
    expect(validateUser({ ...valid, extra: true })).toBe(false);
    const { avatar_url: _avatarUrl, ...missingAvatar } = valid;
    expect(validateUser(missingAvatar)).toBe(false);
  });

  test("shared ErrorEnvelope requires a null details field and a request_id UUID", () => {
    const valid = {
      error: {
        code: "not_found",
        details: null,
        message: "Not found.",
        request_id: VALID_UUID,
      },
    };
    expect(validateErrorEnvelope(valid)).toBe(true);
    expect(
      validateErrorEnvelope({ error: { ...valid.error, details: "oops" } }),
    ).toBe(false);
    expect(
      validateErrorEnvelope({ error: { ...valid.error, request_id: "bad" } }),
    ).toBe(false);
  });

  test("G1/G5 Group and GroupCreate/GroupPatch reject a name outside 1-128 Unicode scalars and unknown fields", () => {
    const valid = {
      created_at: VALID_DATE_TIME,
      id: VALID_UUID,
      main_chatroom_id: VALID_UUID,
      max_members: 10,
      member_count: 1,
      name: "그룹",
      owner_id: VALID_UUID,
    };
    expect(validateGroup(valid)).toBe(true);
    expect(validateGroup({ ...valid, name: "" })).toBe(false);
    expect(validateGroup({ ...valid, name: "n".repeat(129) })).toBe(false);
    expect(validateGroup({ ...valid, max_members: 0 })).toBe(false);
    expect(validateGroup({ ...valid, member_count: -1 })).toBe(false);
    expect(validateGroup({ ...valid, owner_id: "not-a-uuid" })).toBe(false);
    expect(validateGroup({ ...valid, extra: true })).toBe(false);

    expect(validateGroupCreate({ name: "그룹" })).toBe(true);
    expect(validateGroupCreate({ name: "" })).toBe(false);
    expect(validateGroupCreate({ name: "n".repeat(129) })).toBe(false);
    expect(validateGroupCreate({})).toBe(false);
    expect(validateGroupPatch({ name: "renamed" })).toBe(true);
    expect(validateGroupPatch({ name: "" })).toBe(false);
  });

  test("G2 GroupPage rejects a malformed item and preserves next_cursor as an opaque nullable string", () => {
    const group = {
      created_at: VALID_DATE_TIME,
      id: VALID_UUID,
      main_chatroom_id: VALID_UUID,
      max_members: 10,
      member_count: 1,
      name: "그룹",
      owner_id: VALID_UUID,
    };
    expect(validateGroupPage({ items: [group], next_cursor: null })).toBe(true);
    expect(
      validateGroupPage({ items: [group], next_cursor: "opaque-token" }),
    ).toBe(true);
    expect(
      validateGroupPage({
        items: [{ ...group, id: "bad" }],
        next_cursor: null,
      }),
    ).toBe(false);
    expect(validateGroupPage({ items: [group] })).toBe(false);
    expect(validateGroupPage({ items: [group], next_cursor: 123 })).toBe(false);
  });

  test("G4 Member/MemberPage enforce the owner|member enum and reject an unknown role", () => {
    const member = {
      avatar_url: null,
      joined_at: VALID_DATE_TIME,
      nickname: "n",
      role: "owner",
      user_id: VALID_UUID,
    };
    expect(validateMember(member)).toBe(true);
    expect(validateMember({ ...member, role: "admin" })).toBe(false);
    expect(validateMember({ ...member, user_id: "not-a-uuid" })).toBe(false);
    expect(validateMember({ ...member, nickname: "" })).toBe(false);
    expect(
      validateMemberPage({ items: [member], next_cursor: "membership-cursor" }),
    ).toBe(true);
    expect(
      validateMemberPage({
        items: [{ ...member, role: "admin" }],
        next_cursor: null,
      }),
    ).toBe(false);
  });

  test("G8 MemberRolePatch only accepts the owner|member role enum", () => {
    expect(validateMemberRolePatch({ role: "owner" })).toBe(true);
    expect(validateMemberRolePatch({ role: "member" })).toBe(true);
    expect(validateMemberRolePatch({ role: "admin" })).toBe(false);
    expect(validateMemberRolePatch({})).toBe(false);
  });

  test("I1 Invite/InviteCreate accept a nullable future expires_at and positive nullable max_uses", () => {
    const invite = {
      code: "a".repeat(16),
      created_at: VALID_DATE_TIME,
      created_by: VALID_UUID,
      expires_at: null,
      group_id: VALID_UUID,
      id: VALID_UUID,
      max_uses: null,
      used_count: 0,
    };
    expect(validateInvite(invite)).toBe(true);
    expect(
      validateInvite({ ...invite, expires_at: VALID_DATE_TIME, max_uses: 5 }),
    ).toBe(true);
    expect(validateInvite({ ...invite, code: "short" })).toBe(false);
    expect(validateInvite({ ...invite, max_uses: 0 })).toBe(false);
    expect(validateInvite({ ...invite, used_count: -1 })).toBe(false);

    expect(validateInviteCreate({})).toBe(true);
    expect(validateInviteCreate({ expires_at: null, max_uses: null })).toBe(
      true,
    );
    expect(validateInviteCreate({ max_uses: 1 })).toBe(true);
    expect(validateInviteCreate({ max_uses: 0 })).toBe(false);
  });

  test("I2 InviteJoinResult allows joined:false with membership_id:null as a successful already-member outcome", () => {
    expect(
      validateInviteJoinResult({
        group_id: VALID_UUID,
        joined: false,
        membership_id: null,
      }),
    ).toBe(true);
    expect(
      validateInviteJoinResult({
        group_id: VALID_UUID,
        joined: true,
        membership_id: VALID_UUID,
      }),
    ).toBe(true);
    expect(
      validateInviteJoinResult({
        group_id: "not-a-uuid",
        joined: false,
        membership_id: null,
      }),
    ).toBe(false);
    expect(
      validateInviteJoinResult({ group_id: VALID_UUID, joined: false }),
    ).toBe(false);
  });

  test("I2 invite code runtime pattern accepts only 16-64 ASCII alphanumeric/underscore/hyphen", () => {
    expect(isValidInviteJoinCode("a".repeat(16))).toBe(true);
    expect(isValidInviteJoinCode("a".repeat(64))).toBe(true);
    expect(isValidInviteJoinCode("Az09_-".repeat(3))).toBe(true);
    expect(isValidInviteJoinCode("a".repeat(15))).toBe(false);
    expect(isValidInviteJoinCode("a".repeat(65))).toBe(false);
    expect(isValidInviteJoinCode("has a space".padEnd(16, "a"))).toBe(false);
    expect(isValidInviteJoinCode("has/slash".padEnd(16, "a"))).toBe(false);
  });

  test("A5 is browser-only: the callback query is parsed, never fetched as JSON", () => {
    expect(
      parseOAuthCallbackQuery("kakao", { code: "auth-code", state: STATE }),
    ).toEqual({
      code: "auth-code",
      outcome: "authorized",
      provider: "kakao",
      state: STATE,
    });
    expect(
      parseOAuthCallbackQuery("kakao", {
        error: "access_denied",
        state: STATE,
      }),
    ).toEqual({
      error: "access_denied",
      outcome: "denied",
      provider: "kakao",
      state: STATE,
    });
    expect(
      "issues" in
        (parseOAuthCallbackQuery("kakao", {
          code: "auth-code",
          error: "access_denied",
          state: STATE,
        }) as Record<string, unknown>),
    ).toBe(true);
    expect(
      "issues" in
        (parseOAuthCallbackQuery("kakao", { state: STATE }) as Record<
          string,
          unknown
        >),
    ).toBe(true);
    expect(
      "issues" in
        (parseOAuthCallbackQuery("kakao", {
          code: "auth-code",
          state: "short",
        }) as Record<string, unknown>),
    ).toBe(true);
  });

  test("C1 Chatroom/ChatroomPage enforce the main|topic enum and a nullable topic_id", () => {
    const chatroom = {
      created_at: VALID_DATE_TIME,
      group_id: VALID_UUID,
      id: VALID_UUID,
      topic_id: null,
      type: "main",
    };
    expect(validateChatroom(chatroom)).toBe(true);
    expect(
      validateChatroom({ ...chatroom, type: "topic", topic_id: VALID_UUID }),
    ).toBe(true);
    expect(validateChatroom({ ...chatroom, type: "direct" })).toBe(false);
    const { topic_id: _topicId, ...missingTopicId } = chatroom;
    expect(validateChatroom(missingTopicId)).toBe(false);
    expect(validateChatroom({ ...chatroom, extra: true })).toBe(false);

    expect(
      validateChatroomPage({ items: [chatroom], next_cursor: "opaque-token" }),
    ).toBe(true);
    expect(validateChatroomPage({ items: [chatroom] })).toBe(false);
    expect(
      validateChatroomPage({
        items: [{ ...chatroom, type: "bad" }],
        next_cursor: null,
      }),
    ).toBe(false);
  });

  test("C2 DenormalizedMessage requires nullable body/sender/nickname/avatar/client_msg_id and caps media at 4 items", () => {
    const message = {
      body: null,
      chatroom_id: VALID_UUID,
      client_msg_id: null,
      created_at: "2024-01-01T00:00:00.123456Z",
      id: VALID_UUID,
      media: [],
      sender_avatar_url: null,
      sender_id: null,
      sender_nickname: null,
      type: "system",
    };
    expect(validateDenormalizedMessage(message)).toBe(true);
    expect(
      validateDenormalizedMessage({
        ...message,
        body: "안녕 emoji 😀",
        client_msg_id: VALID_UUID,
        sender_avatar_url: "https://example.com/a.png",
        sender_id: VALID_UUID,
        sender_nickname: "닉네임",
        type: "user",
      }),
    ).toBe(true);
    const { body: _body, ...missingBody } = message;
    expect(validateDenormalizedMessage(missingBody)).toBe(false);
    expect(validateDenormalizedMessage({ ...message, type: "bot" })).toBe(
      false,
    );
    expect(
      validateDenormalizedMessage({
        ...message,
        media: new Array(5).fill({
          byte_size: 1,
          duration: null,
          filename: null,
          height: null,
          id: VALID_UUID,
          media_upload_id: VALID_UUID,
          position: 0,
          type: "image/png",
          width: null,
        }),
      }),
    ).toBe(false);

    expect(
      validateDenormalizedMessagePage({ items: [message], next_cursor: null }),
    ).toBe(true);
    expect(
      validateDenormalizedMessagePage({
        items: [{ ...message, sender_id: "not-a-uuid" }],
        next_cursor: null,
      }),
    ).toBe(false);
  });

  test("C4 MessageCreate requires a UUID client_msg_id and a non-empty body when media is absent", () => {
    expect(
      validateMessageCreate({ body: "안녕", client_msg_id: VALID_UUID }),
    ).toBe(true);
    expect(validateMessageCreate({ body: "", client_msg_id: VALID_UUID })).toBe(
      false,
    );
    expect(validateMessageCreate({ client_msg_id: VALID_UUID })).toBe(false);
    expect(validateMessageCreate({ body: "안녕" })).toBe(false);
    expect(
      validateMessageCreate({ body: "안녕", client_msg_id: "not-a-uuid" }),
    ).toBe(false);
  });

  test("C4 CanonicalMessage permits absent/null body, sender_id and client_msg_id but no sender nickname/avatar", () => {
    const canonical = {
      chatroom_id: VALID_UUID,
      created_at: VALID_DATE_TIME,
      id: VALID_UUID,
      media: [],
      type: "user",
    };
    expect(validateCanonicalMessage(canonical)).toBe(true);
    expect(
      validateCanonicalMessage({
        ...canonical,
        body: null,
        client_msg_id: null,
        sender_id: null,
      }),
    ).toBe(true);
    expect(
      validateCanonicalMessage({
        ...canonical,
        body: "안녕",
        client_msg_id: VALID_UUID,
        sender_id: VALID_UUID,
      }),
    ).toBe(true);
    expect(
      validateCanonicalMessage({ ...canonical, sender_nickname: "닉네임" }),
    ).toBe(false);
    expect(validateCanonicalMessage({ ...canonical, type: "bot" })).toBe(false);
  });

  test("C3 ReadCursorIn/ReadMarker accept only a positive decimal string cursor", () => {
    expect(validateReadCursorIn({ cursor: "1" })).toBe(true);
    expect(validateReadCursorIn({ cursor: "0" })).toBe(false);
    expect(validateReadCursorIn({ cursor: "01" })).toBe(false);
    expect(validateReadCursorIn({ cursor: -1 })).toBe(false);
    expect(validateReadCursorIn({ cursor: 1 })).toBe(false);

    const marker = {
      chatroom_id: VALID_UUID,
      last_read_cursor: "42",
      updated_at: VALID_DATE_TIME,
    };
    expect(validateReadMarker(marker)).toBe(true);
    expect(validateReadMarker({ ...marker, last_read_cursor: 42 })).toBe(false);
  });
});
