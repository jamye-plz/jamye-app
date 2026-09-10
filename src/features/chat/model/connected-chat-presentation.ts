import type {
  ConnectedChatMessage,
  ConnectedSendErrorCode,
} from "@/core/database/account/connected-chat-types";
import type { ChatMessage } from "./chat-message-window";
import type {
  ConnectedChatState,
  ConnectedChatStoreActions,
} from "./connected-chat-store";
import type { ChatConversation } from "../use-chat-conversation";

export const isChatIdentifier = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function toChatMessage(
  row: ConnectedChatMessage,
  userId: string,
): ChatMessage {
  const attachment = row.media.length
    ? `첨부 파일 ${row.media.length}개 · 이 단계에서는 열 수 없습니다.`
    : "";
  return {
    body:
      [row.body, attachment].filter(Boolean).join("\n") ||
      "표시할 수 없는 메시지입니다.",
    clientMsgId: row.clientMsgId,
    conversationId: row.chatroomId,
    // Display only. Repository ordering retains the original sub-millisecond timestamp.
    createdAtMs: row.createdAtRaw
      ? Date.parse(row.createdAtRaw)
      : row.localCreatedAtMs,
    localId: row.localId,
    senderId: row.senderId,
    senderLabel:
      row.kind === "system"
        ? "시스템"
        : row.senderId === userId
          ? "나"
          : (row.senderNickname ?? "알 수 없는 사용자"),
    isOutgoing: row.kind === "user" && row.senderId === userId,
    serverMessageId: row.serverMessageId,
    status: row.status,
  };
}

export function toChatConversation(
  state: ConnectedChatState,
  actions: ConnectedChatStoreActions,
  userId: string,
): ChatConversation {
  const history = state.history;
  return {
    items: history.items.map((row) => toChatMessage(row, userId)),
    hasMore: history.hasMore,
    initialPageStatus:
      history.status === "idle" || history.status === "loading"
        ? "loading"
        : history.items.length === 0 && history.status === "error"
          ? "error"
          : "ready",
    olderPageStatus: history.loadingMore
      ? "loading"
      : history.error && history.items.length > 0
        ? "error"
        : "idle",
    loadOlder: actions.loadOlderHistory,
    retryInitialPage: () =>
      state.chatroomId ? actions.openRoom(state.chatroomId) : Promise.resolve(),
  };
}

export function chatErrorMessage(error: ConnectedSendErrorCode): string {
  const labels: Record<ConnectedSendErrorCode, string> = {
    network:
      "연결이 끊겼습니다. 서버에 반영됐을 수 있으니 같은 메시지로 다시 시도하세요.",
    unauthorized: "로그인을 다시 확인해 주세요.",
    forbidden: "이 대화에 접근할 수 없습니다.",
    conflict:
      "같은 전송 ID의 내용이 서버와 충돌합니다. 새 ID로 자동 전송하지 않습니다.",
    validation: "요청을 처리할 수 없습니다. 입력을 확인해 주세요.",
    server_unavailable:
      "서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도하세요.",
    unknown:
      "처리를 완료하지 못했습니다. 저장 상태를 확인하고 다시 시도하세요.",
  };
  return labels[error];
}
