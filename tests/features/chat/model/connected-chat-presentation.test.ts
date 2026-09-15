import {
  chatErrorMessage,
  isChatIdentifier,
  toChatConversation,
  toChatMessage,
} from "@/features/chat/model/connected-chat-presentation";
import { createConnectedChatStore } from "@/features/chat/model/connected-chat-store";
import {
  CHATROOM_ID,
  PRINCIPAL,
  fakeChatApi,
  fakeClock,
  fakeMessageIdentity,
  repositoryHistoryRow,
} from "./connected-chat-fixtures";

test("identifiers reject empty, list-valued and malformed route values", () => {
  expect(isChatIdentifier(CHATROOM_ID)).toBe(true);
  for (const value of ["", "undefined", "room/other", `${CHATROOM_ID},other`])
    expect(isChatIdentifier(value)).toBe(false);
});

test("outgoing direction uses the authenticated sender, not presence of another sender's client ID", () => {
  expect(
    toChatMessage(
      repositoryHistoryRow({
        senderId: "other",
        clientMsgId: "someone-elses-id",
        senderNickname: "다른 사람",
      }),
      PRINCIPAL.userId,
    ),
  ).toMatchObject({ isOutgoing: false, senderLabel: "다른 사람" });
  expect(toChatMessage(repositoryHistoryRow(), PRINCIPAL.userId)).toMatchObject(
    { isOutgoing: true, senderLabel: "나" },
  );
});

test("tombstoned and system messages need neither a sender nor a body; no event cursor is fabricated", () => {
  const unknown = toChatMessage(
    repositoryHistoryRow({ senderId: null, senderNickname: null, body: null }),
    PRINCIPAL.userId,
  );
  expect(unknown).toMatchObject({
    senderLabel: "알 수 없는 사용자",
    body: "표시할 수 없는 메시지입니다.",
    isOutgoing: false,
  });
  expect(unknown).not.toHaveProperty("eventId");
  expect(unknown).not.toHaveProperty("serverSequence");
  expect(
    toChatMessage(
      repositoryHistoryRow({ kind: "system", senderId: null }),
      PRINCIPAL.userId,
    ).senderLabel,
  ).toBe("시스템");
});

test("media retains canonical IDs for M11 access and timestamps are display-only", () => {
  const row = repositoryHistoryRow({
    createdAtRaw: "2026-09-10T00:00:00.123456789Z",
    body: null,
    media: [
      {
        byteSize: 123,
        duration: null,
        filename: null,
        height: null,
        id: "media",
        mediaUploadId: "upload",
        position: 0,
        posterMediaId: null,
        type: "image/jpeg",
        width: null,
      },
    ],
  });
  const result = toChatMessage(row, PRINCIPAL.userId);
  expect(result.body).toBe("");
  expect(result.media).toEqual(row.media);
  expect(result.media?.[0]).toMatchObject({
    id: "media",
    mediaUploadId: "upload",
  });
  expect(row.createdAtRaw).toBe("2026-09-10T00:00:00.123456789Z");
  expect(result.serverMessageId).toBe(row.serverMessageId);
  expect(
    toChatMessage(
      { ...row, createdAtRaw: null, localCreatedAtMs: 100 },
      PRINCIPAL.userId,
    ).createdAtMs,
  ).toBe(100);
});

test("an empty text-only historical row keeps its safe placeholder", () => {
  expect(
    toChatMessage(
      repositoryHistoryRow({ body: "", media: [] }),
      PRINCIPAL.userId,
    ).body,
  ).toBe("표시할 수 없는 메시지입니다.");
});

test("initial, pagination and retry states adapt to the existing chat list without altering SQLite order", async () => {
  const store = createConnectedChatStore({
    clock: fakeClock(),
    createApi: fakeChatApi,
    messageIdentity: fakeMessageIdentity(),
  });
  const state = store.getState();
  const actions = {
    ...store.actions,
    openRoom: jest.fn().mockResolvedValue(undefined),
  };
  const view = (patch: Partial<typeof state.history>) =>
    toChatConversation(
      {
        ...state,
        chatroomId: CHATROOM_ID,
        history: { ...state.history, ...patch },
      },
      actions,
      PRINCIPAL.userId,
    );
  expect(view({ status: "loading" }).initialPageStatus).toBe("loading");
  expect(view({ status: "error" }).initialPageStatus).toBe("error");
  expect(view({ status: "ready" }).initialPageStatus).toBe("ready");
  const items = [
    repositoryHistoryRow({ localId: "first" }),
    repositoryHistoryRow({ localId: "second" }),
  ];
  expect(view({ status: "error", items, error: "network" })).toMatchObject({
    initialPageStatus: "ready",
    olderPageStatus: "error",
    items: [{ localId: "first" }, { localId: "second" }],
  });
  expect(view({ loadingMore: true }).olderPageStatus).toBe("loading");
  await view({}).retryInitialPage();
  expect(actions.openRoom).toHaveBeenCalledWith(CHATROOM_ID);
  await toChatConversation(state, actions, PRINCIPAL.userId).retryInitialPage();
  expect(actions.openRoom).toHaveBeenCalledTimes(1);
});

test("each send failure class has a visible explanation, including ambiguity and idempotency conflict", () => {
  for (const error of [
    "network",
    "unauthorized",
    "forbidden",
    "conflict",
    "validation",
    "server_unavailable",
    "unknown",
  ] as const)
    expect(chatErrorMessage(error).length).toBeGreaterThan(10);
  expect(chatErrorMessage("conflict")).toContain(
    "새 ID로 자동 전송하지 않습니다",
  );
  expect(chatErrorMessage("network")).toContain("반영됐을 수");
});
