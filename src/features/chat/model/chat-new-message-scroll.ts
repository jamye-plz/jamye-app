/** R4: how close (px) the bottom of the visible viewport must be to the
 * bottom of the content before a new arrival counts as "at the bottom". */
export const NEW_MESSAGE_NEAR_BOTTOM_THRESHOLD_PX = 120;

/** Pure re-implementation of the FlatList `onScroll` "near bottom" test,
 * factored out so it is unit-testable without mounting reanimated/FlatList. */
export function isScrollNearBottom({
  contentOffset,
  contentHeight,
  viewportHeight,
  thresholdPx = NEW_MESSAGE_NEAR_BOTTOM_THRESHOLD_PX,
}: Readonly<{
  contentOffset: number;
  contentHeight: number;
  viewportHeight: number;
  thresholdPx?: number;
}>): boolean {
  const distanceFromBottom = contentHeight - (contentOffset + viewportHeight);
  return distanceFromBottom <= thresholdPx;
}

export type NewMessageScrollAction = "auto-scroll" | "show-pill" | "none";

/**
 * R4: "맨 아래(임계값 내)를 보고 있으면 새 메시지 도착 시 자동 스크롤,
 * 위를 읽는 중이면 떠 있는 `새 메시지` 버튼" -- and E11's "로컬 commit
 * 메시지만 reveal 요청" invariant, kept intact: a message that the commit
 * flow (`ChatComposer`'s `onMessageCommitted` -> `latestMessageRevealTarget`)
 * already owns is excluded here (`commitRevealTarget`) so this incoming-tail
 * path never double-fires for the user's own just-sent message, which
 * always reveals unconditionally through the separate, existing mechanism.
 */
export function decideNewMessageScroll({
  previousTailLocalId,
  nextTailLocalId,
  isNearBottom,
  commitRevealTarget,
}: Readonly<{
  previousTailLocalId: string | null;
  nextTailLocalId: string | null;
  isNearBottom: boolean;
  commitRevealTarget: string | null;
}>): NewMessageScrollAction {
  if (
    nextTailLocalId === null ||
    previousTailLocalId === null ||
    nextTailLocalId === previousTailLocalId ||
    nextTailLocalId === commitRevealTarget
  ) {
    return "none";
  }
  return isNearBottom ? "auto-scroll" : "show-pill";
}
