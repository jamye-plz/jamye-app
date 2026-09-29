export type PendingDestructive =
  | Readonly<{ kind: "delete"; chatroomId: string; serverMessageId: string }>
  | Readonly<{ kind: "discard"; clientMsgId: string }>;

/** E10 exact copy, kept in its own React/React-Native-free module so it is
 * unit-testable without dragging in `expo-router` (etc.) through
 * `chat-screen.tsx`'s imports -- `ConfirmAlert`/`Host` render whichever of
 * these two shapes `chat-screen.tsx`'s `ChatConversationScreen` picks
 * (delete: AC3, discard: AC5). */
export function destructiveConfirmCopy(
  pending: PendingDestructive,
): Readonly<{ confirmLabel: string; message: string; title: string }> {
  return pending.kind === "discard"
    ? {
        confirmLabel: "버리기",
        message: "전송하지 못한 메시지를 이 기기에서 지웁니다.",
        title: "메시지를 버릴까요?",
      }
    : {
        confirmLabel: "삭제",
        message: "모든 사람의 대화방에서 삭제됩니다.",
        title: "메시지를 삭제할까요?",
      };
}
