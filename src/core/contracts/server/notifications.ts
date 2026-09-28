import type { NotificationPageWire, NotificationWire } from "./validators";

/**
 * Server D9 decision: `args` is a single-key record whose key depends on
 * `type` (new_topic -> author_display_name, chat_unread -> sender_display_name).
 * This layer never interprets the key, only passes the wire object through
 * unmodified; notification-copy.ts (a later M12 task) is the sole place
 * allowed to read a specific key, and it must fall back safely when the
 * expected key is absent or `type` is unrecognized.
 *
 * M14 round 2 S1 additionally fans out `group_name` (always) and, for
 * topic-related types (`new_topic`, and `chat_unread` on a topic's own
 * chatroom), `topic_title` alongside the existing type-keyed field above.
 * This stays inside the pre-existing NotificationArgs wire rule (key pattern
 * `^[a-z][a-z0-9_]{0,63}$`, at most 16 properties, string/number/boolean/null
 * values), so no schema change accompanies it. See E5 and
 * `readNotificationContextString` below for the safe optional read.
 */
export type NotificationArgs = Readonly<
  Record<string, string | number | boolean | null>
>;

export type NotificationType = NotificationWire["type"];

export type Notification = Readonly<{
  id: string;
  type: NotificationType;
  args: NotificationArgs;
  topicId: string | null;
  conversationId: string | null;
  sourceCursor: string | null;
  readAt: string | null;
  createdAt: string;
}>;

export type NotificationPage = Readonly<{
  items: readonly Notification[];
  nextCursor: string | null;
  unreadCount: number;
}>;

export function mapNotification(wire: NotificationWire): Notification {
  return {
    args: wire.args,
    conversationId: wire.conversation_id,
    createdAt: wire.created_at,
    id: wire.id,
    readAt: wire.read_at,
    sourceCursor: wire.source_cursor,
    topicId: wire.topic_id,
    type: wire.type,
  };
}

/** N1's next_cursor is an opaque server token: pass it through unparsed. unread_count is always server-authoritative, never locally aggregated. */
export function mapNotificationPage(
  wire: NotificationPageWire,
): NotificationPage {
  return {
    items: wire.items.map(mapNotification),
    nextCursor: wire.next_cursor,
    unreadCount: wire.unread_count,
  };
}

/**
 * E5: S1's `group_name`/`topic_title` context keys are optional and
 * free-form (NotificationArgs has no per-key schema), so a consumer must
 * treat a missing key or a non-string value identically: don't display the
 * key. Shared here so notification-copy.ts (task-app-notifications) and any
 * other NotificationArgs reader use one safe accessor instead of duplicating
 * this narrowing.
 */
export function readNotificationContextString(
  args: NotificationArgs,
  key: "group_name" | "topic_title",
): string | null {
  const value = args[key];
  return typeof value === "string" ? value : null;
}
