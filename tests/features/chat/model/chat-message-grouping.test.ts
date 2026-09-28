import {
  SYSTEM_SENDER_LABEL,
  buildChatMessageRowMeta,
} from "@/features/chat/model/chat-message-grouping";
import type { ChatMessage } from "@/features/chat/model/chat-message-window";

const NOW = new Date("2025-09-27T12:10:00+09:00");

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    body: "body",
    clientMsgId: null,
    conversationId: "room-1",
    createdAtMs: Date.parse("2025-09-27T12:00:00+09:00"),
    localId: "local-1",
    senderId: "sender-1",
    senderLabel: "상대",
    status: "sent",
    ...overrides,
  };
}

describe("buildChatMessageRowMeta (E7)", () => {
  test("groups consecutive messages from the same sender within 5 minutes on the same date", () => {
    const items = [
      message({
        createdAtMs: Date.parse("2025-09-27T12:00:00+09:00"),
        localId: "a",
      }),
      message({
        createdAtMs: Date.parse("2025-09-27T12:02:00+09:00"),
        localId: "b",
      }),
      message({
        createdAtMs: Date.parse("2025-09-27T12:04:30+09:00"),
        localId: "c",
      }),
    ];
    const meta = buildChatMessageRowMeta(items, NOW);
    expect(meta[0]).toMatchObject({
      isGroupedWithPrevious: false,
      isLastInGroup: false,
    });
    expect(meta[1]).toMatchObject({
      isGroupedWithPrevious: true,
      isLastInGroup: false,
    });
    expect(meta[2]).toMatchObject({
      isGroupedWithPrevious: true,
      isLastInGroup: true,
    });
  });

  test("breaks the group when the gap from the previous message exceeds 5 minutes", () => {
    const items = [
      message({
        createdAtMs: Date.parse("2025-09-27T12:00:00+09:00"),
        localId: "a",
      }),
      message({
        createdAtMs: Date.parse("2025-09-27T12:05:01+09:00"),
        localId: "b",
      }),
    ];
    const meta = buildChatMessageRowMeta(items, NOW);
    expect(meta[0].isLastInGroup).toBe(true);
    expect(meta[1].isGroupedWithPrevious).toBe(false);
  });

  test("breaks the group when the sender changes even within the time window", () => {
    const items = [
      message({
        createdAtMs: Date.parse("2025-09-27T12:00:00+09:00"),
        localId: "a",
        senderId: "sender-1",
      }),
      message({
        createdAtMs: Date.parse("2025-09-27T12:01:00+09:00"),
        localId: "b",
        senderId: "sender-2",
        senderLabel: "다른 상대",
      }),
    ];
    const meta = buildChatMessageRowMeta(items, NOW);
    expect(meta[0].isLastInGroup).toBe(true);
    expect(meta[1].isGroupedWithPrevious).toBe(false);
  });

  test("never groups a message across a sender-label change even with the same senderId", () => {
    const items = [
      message({
        createdAtMs: Date.parse("2025-09-27T12:00:00+09:00"),
        localId: "a",
        senderId: "shared-id",
        senderLabel: "닉네임A",
      }),
      message({
        createdAtMs: Date.parse("2025-09-27T12:01:00+09:00"),
        localId: "b",
        senderId: "shared-id",
        senderLabel: "닉네임B",
      }),
    ];
    const meta = buildChatMessageRowMeta(items, NOW);
    expect(meta[1].isGroupedWithPrevious).toBe(false);
  });

  test("inserts a date separator on the first message and whenever the local calendar date changes", () => {
    const items = [
      message({
        createdAtMs: Date.parse("2025-09-26T23:50:00+09:00"),
        localId: "a",
      }),
      message({
        createdAtMs: Date.parse("2025-09-27T00:05:00+09:00"),
        localId: "b",
      }),
      message({
        createdAtMs: Date.parse("2025-09-27T00:06:00+09:00"),
        localId: "c",
      }),
    ];
    const meta = buildChatMessageRowMeta(items, NOW);
    expect(meta[0].showDateSeparator).toBe(true);
    expect(meta[0].dateSeparatorLabel).not.toBe("");
    expect(meta[1].showDateSeparator).toBe(true);
    expect(meta[1].dateSeparatorLabel).not.toBe("");
    expect(meta[2].showDateSeparator).toBe(false);
    expect(meta[2].dateSeparatorLabel).toBe("");
    // A date change also always starts a new group, even if the sender and
    // gap would otherwise have chained (E7's "same sender + same date" rule).
    expect(meta[1].isGroupedWithPrevious).toBe(false);
  });

  test("formats the per-row time label from chatTime and the separator from chatDate", () => {
    const items = [
      message({ createdAtMs: Date.parse("2025-09-27T12:01:00+09:00") }),
    ];
    const meta = buildChatMessageRowMeta(items, NOW);
    expect(meta[0].timeLabel).toBe("오후 12:01");
    expect(meta[0].dateSeparatorLabel).toContain("9월 27일");
  });

  test("marks system-labeled rows as isolated (never grouped) system messages", () => {
    const items = [
      message({
        createdAtMs: Date.parse("2025-09-27T12:00:00+09:00"),
        localId: "a",
        senderId: null,
        senderLabel: SYSTEM_SENDER_LABEL,
      }),
      message({
        createdAtMs: Date.parse("2025-09-27T12:00:30+09:00"),
        localId: "b",
        senderId: null,
        senderLabel: SYSTEM_SENDER_LABEL,
      }),
    ];
    const meta = buildChatMessageRowMeta(items, NOW);
    expect(meta[0].isSystem).toBe(true);
    expect(meta[1].isSystem).toBe(true);
    expect(meta[0].isGroupedWithPrevious).toBe(false);
    expect(meta[1].isGroupedWithPrevious).toBe(false);
  });

  test("computes showSentStatus for only the single last outgoing row in one linear pass", () => {
    const items = [
      message({
        localId: "out-1",
        clientMsgId: "client-1",
        isOutgoing: true,
        createdAtMs: Date.parse("2025-09-27T12:00:00+09:00"),
      }),
      message({
        localId: "in-1",
        clientMsgId: null,
        isOutgoing: false,
        createdAtMs: Date.parse("2025-09-27T12:01:00+09:00"),
      }),
      message({
        localId: "out-2",
        clientMsgId: "client-2",
        isOutgoing: true,
        createdAtMs: Date.parse("2025-09-27T12:02:00+09:00"),
      }),
    ];
    const meta = buildChatMessageRowMeta(items, NOW);
    expect(meta.map((row) => row.showSentStatus)).toEqual([false, false, true]);
  });

  test("keeps outgoing and incoming rows from the same senderId out of the same group", () => {
    // Defensive: a system or mirrored row should never visually merge with a
    // differently-directed row even if ids happened to collide.
    const items = [
      message({
        localId: "a",
        senderId: "shared",
        isOutgoing: true,
        createdAtMs: Date.parse("2025-09-27T12:00:00+09:00"),
      }),
      message({
        localId: "b",
        senderId: "shared",
        isOutgoing: false,
        createdAtMs: Date.parse("2025-09-27T12:00:30+09:00"),
      }),
    ];
    const meta = buildChatMessageRowMeta(items, NOW);
    expect(meta[1].isGroupedWithPrevious).toBe(false);
  });
});
