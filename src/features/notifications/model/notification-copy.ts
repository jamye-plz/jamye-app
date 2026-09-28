import type {
  NotificationArgs,
  NotificationType,
} from "@/core/contracts/server";
import { readNotificationContextString } from "@/core/contracts/server/notifications";

/**
 * Pure `type` + `args` -> Korean copy renderer. Never interpolates raw
 * `args` values other than the single expected display-name key per D9
 * (`author_display_name` for `new_topic`, `sender_display_name` for
 * `chat_unread`), and only after confirming it is a non-empty string. Any
 * unrecognized `type`, missing/malformed args, or the `"other"` type all
 * fall back to a safe generic copy -- this file must never crash and must
 * never surface raw JSON/`undefined`/`null` text to the user.
 */
export type NotificationCopy = Readonly<{
  title: string;
  body: string;
}>;

const GENERIC_COPY: NotificationCopy = {
  body: "내용을 확인해 보세요.",
  title: "새 알림",
};

function displayName(args: NotificationArgs, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function getNotificationCopy(
  type: NotificationType,
  args: NotificationArgs,
): NotificationCopy {
  if (type === "new_topic") {
    const author = displayName(args, "author_display_name");
    return {
      body: author
        ? `${author}님이 새 주제를 올렸습니다.`
        : "새 주제가 올라왔습니다.",
      title: "새 주제 알림",
    };
  }
  if (type === "chat_unread") {
    const sender = displayName(args, "sender_display_name");
    return {
      body: sender
        ? `${sender}님이 메시지를 보냈습니다.`
        : "새 메시지가 도착했습니다.",
      title: "새 메시지",
    };
  }
  // "other" and any future/unrecognized server-sent type value both land
  // here; this must stay a fixed, safe copy independent of `args`.
  return GENERIC_COPY;
}

/**
 * Row icon kind (N1). Model-layer only: returns a semantic kind, never a UI
 * symbol name, so this file stays free of a `shared/ui` import. Callers map
 * "other" to whatever generic notification glyph their platform uses.
 */
export type NotificationKind = "newTopic" | "newMessage" | "other";

export function getNotificationKind(type: NotificationType): NotificationKind {
  if (type === "new_topic") return "newTopic";
  if (type === "chat_unread") return "newMessage";
  return "other";
}

/**
 * N3/S1/E5: `그룹 이름 · 주제 제목` (topic-related types) or `그룹 이름` alone,
 * using the shared `readNotificationContextString` accessor so a missing key
 * or a non-string value is treated identically (no line at all) -- never a
 * duplicate narrowing of the E5 rule here.
 */
export function getNotificationContextLine(
  args: NotificationArgs,
): string | null {
  const groupName = readNotificationContextString(args, "group_name");
  if (!groupName) return null;
  const topicTitle = readNotificationContextString(args, "topic_title");
  return topicTitle ? `${groupName} · ${topicTitle}` : groupName;
}
