import { formatJamyeTimeLabel } from "@/shared/datetime/relative-labels";
import type { ChatMessage } from "./chat-message-window";

/** R1/E7: presentation-layer sentinel `connected-chat-presentation.ts`'s
 * `toChatMessage` already assigns to `senderLabel` for `kind === "system"`
 * rows. Kept as one shared constant so this file and `chat-message-row.tsx`
 * never duplicate the literal. */
export const SYSTEM_SENDER_LABEL = "시스템";

/** R1/E7: "한 무리" = same sender + same local calendar date + within 5
 * minutes of the immediately preceding message (a chained gap check, not a
 * total-span check -- matches iMessage/Google Messages grouping). */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function isOutgoingMessage(message: ChatMessage): boolean {
  return message.isOutgoing ?? message.clientMsgId !== null;
}

function isSystemMessage(message: ChatMessage): boolean {
  return message.senderLabel === SYSTEM_SENDER_LABEL;
}

function sameLocalDate(leftMs: number, rightMs: number): boolean {
  const left = new Date(leftMs);
  const right = new Date(rightMs);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameGroup(previous: ChatMessage, next: ChatMessage): boolean {
  return (
    !isSystemMessage(previous) &&
    !isSystemMessage(next) &&
    previous.senderId !== null &&
    previous.senderId === next.senderId &&
    previous.senderLabel === next.senderLabel &&
    isOutgoingMessage(previous) === isOutgoingMessage(next) &&
    sameLocalDate(previous.createdAtMs, next.createdAtMs) &&
    Math.abs(next.createdAtMs - previous.createdAtMs) <= GROUP_WINDOW_MS
  );
}

export type ChatMessageRowMeta = Readonly<{
  localId: string;
  isSystem: boolean;
  isOutgoing: boolean;
  /** False for the first bubble of a group (or a lone message): the sender
   * caption renders above it. */
  isGroupedWithPrevious: boolean;
  /** True for the last bubble of a group: the avatar (incoming) sits beside
   * it and the time/status caption renders below it. */
  isLastInGroup: boolean;
  showDateSeparator: boolean;
  /** `formatJamyeTimeLabel(..., {mode:"chatDate"})`, e.g. "9월 27일 토요일".
   * Empty string when `showDateSeparator` is false. */
  dateSeparatorLabel: string;
  /** `formatJamyeTimeLabel(..., {mode:"chatTime"})`, e.g. "오후 12:01". */
  timeLabel: string;
  /** R1: "전송됨" renders only on the single last outgoing row -- computed
   * once per list (linear), not per row (was O(n^2) via a `.slice().some()`
   * inside the FlatList `renderItem`). */
  showSentStatus: boolean;
}>;

/**
 * O(n) single pass building per-row presentation metadata for a non-inverted
 * `items` window: one linear scan finds the last outgoing row, then one
 * linear map derives grouping/date/time flags from each row's immediate
 * neighbors only (no re-scan of the array per row).
 */
export function buildChatMessageRowMeta(
  items: readonly ChatMessage[],
  now: Date = new Date(),
): readonly ChatMessageRowMeta[] {
  // E6b/CHAT-AC5: a deleted row is never the one carrying `showSentStatus`
  // (which chat-message-row.tsx uses to append " · 전송됨") -- only the most
  // recent *live* outgoing row still qualifies, so a deletion of what was the
  // last outgoing message defers the status caption to the nearest surviving
  // one instead of showing 전송됨 on a row that now reads "삭제된 메시지입니다.".
  let lastOutgoingLocalId: string | null = null;
  for (const item of items) {
    if (isOutgoingMessage(item) && item.deletedAtMs == null)
      lastOutgoingLocalId = item.localId;
  }

  return items.map((item, index) => {
    const previous = index > 0 ? items[index - 1] : undefined;
    const next = index + 1 < items.length ? items[index + 1] : undefined;
    const isSystem = isSystemMessage(item);
    const isGroupedWithPrevious =
      previous !== undefined && isSameGroup(previous, item);
    const isLastInGroup = next === undefined || !isSameGroup(item, next);
    const showDateSeparator =
      previous === undefined ||
      !sameLocalDate(previous.createdAtMs, item.createdAtMs);

    return {
      localId: item.localId,
      isSystem,
      isOutgoing: isOutgoingMessage(item),
      isGroupedWithPrevious,
      isLastInGroup,
      showDateSeparator,
      dateSeparatorLabel: showDateSeparator
        ? formatJamyeTimeLabel(item.createdAtMs, { mode: "chatDate", now })
        : "",
      timeLabel: formatJamyeTimeLabel(item.createdAtMs, {
        mode: "chatTime",
        now,
      }),
      showSentStatus: item.localId === lastOutgoingLocalId,
    };
  });
}
