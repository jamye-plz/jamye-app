import type { ChatReadMarker } from "@/core/contracts/server";
import type {
  ConnectedChatMessage,
  ConnectedSendErrorCode,
} from "@/core/database/account/connected-chat-types";

export type ConnectedChatReadState = Readonly<{
  status: "idle" | "pending" | "ready" | "error";
  marker: ChatReadMarker | null;
  error: ConnectedSendErrorCode | null;
}>;
export const emptyReadState = (): ConnectedChatReadState => ({
  status: "idle",
  marker: null,
  error: null,
});

/** Visibility comes from FlatList, not the last loaded page or a fabricated cursor. */
export function createConnectedChatRead(
  input: Readonly<{
    currentRoom: () => string | null;
    messages: () => readonly ConnectedChatMessage[];
    enabled: () => boolean;
    begin: () => null | Readonly<{
      current: () => boolean;
      execute: (roomId: string, messageId: string) => Promise<ChatReadMarker>;
    }>;
    publish: (state: ConnectedChatReadState) => void;
    errorCode: (error: unknown) => ConnectedSendErrorCode;
    onError: (error: unknown) => void;
  }>,
) {
  let state = emptyReadState();
  let visible: readonly string[] = [];
  let requested: string | null = null;
  function candidate(): string | null {
    if (!input.enabled()) return null;
    const roomId = input.currentRoom();
    const ids = new Set(visible);
    return (
      [...input.messages()]
        .reverse()
        .find(
          (row) =>
            row.chatroomId === roomId &&
            row.status === "sent" &&
            row.serverMessageId !== null &&
            ids.has(row.serverMessageId),
        )?.serverMessageId ?? null
    );
  }
  async function mark(retry = false): Promise<void> {
    const roomId = input.currentRoom();
    const id = candidate();
    if (
      !roomId ||
      !id ||
      (!retry && id === requested) ||
      (retry && state.status !== "error")
    )
      return;
    const ticket = input.begin();
    if (!ticket) return;
    requested = id;
    state = { ...state, status: "pending", error: null };
    input.publish(state);
    try {
      const marker = await ticket.execute(roomId, id);
      if (!ticket.current()) return;
      state = { status: "ready", marker, error: null };
      input.publish(state);
    } catch (error) {
      if (!ticket.current()) return;
      state = { ...state, status: "error", error: input.errorCode(error) };
      input.publish(state);
      input.onError(error);
    }
  }
  return {
    reset() {
      visible = [];
      requested = null;
      state = emptyReadState();
    },
    markVisibleMessages(ids: readonly string[]) {
      visible = [...ids];
      return mark();
    },
    retryRead: () => mark(true),
  };
}
