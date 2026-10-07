import type {
  ConnectedChatMedia,
  ConnectedPendingAttachment,
  ConnectedSendErrorCode,
} from "@/core/database/account/connected-chat-types";

/** Presentation-only message fields rendered by the chat list. */
export type ChatMessage = Readonly<{
  body: string;
  clientMsgId: string | null;
  conversationId: string;
  createdAtMs: number;
  localId: string;
  status: "pending" | "sent" | "failed";
  senderId: string | null;
  isOutgoing?: boolean;
  senderLabel?: string;
  /** R1/E7: incoming-group avatar source. Undefined falls back to the
   * monogram via `Avatar`. */
  senderAvatarUrl?: string | null;
  serverMessageId?: string | null;
  /** AC4/E2: ms epoch this device recorded the tombstone, or
   * null/undefined while live. Mirrors `ConnectedChatMessage.deletedAtMs`;
   * the connected/REST mapping site must copy it through unchanged. */
  deletedAtMs?: number | null;
  /** E2/CHAT-AC3: mirrors `ConnectedChatMessage.errorCode` -- the backing
   * outbox command's current failure reason, when known. */
  errorCode?: ConnectedSendErrorCode | null;
  media?: readonly ConnectedChatMedia[];
  pendingMedia?: readonly ConnectedPendingAttachment[];
}>;

/** The paged message window a conversation screen renders and scrolls. */
export type ChatConversation = Readonly<{
  hasMore: boolean;
  initialPageStatus: "error" | "loading" | "ready";
  items: readonly ChatMessage[];
  loadOlder: () => Promise<void>;
  olderPageStatus: "error" | "idle" | "loading";
  retryInitialPage: () => Promise<void>;
}>;
