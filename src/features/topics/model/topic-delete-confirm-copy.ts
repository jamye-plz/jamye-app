/** E10 exact copy for the topic-delete `ConfirmAlert`, kept in its own
 * React/React-Native-free module (mirrors
 * `src/features/chat/model/destructive-confirm-copy.ts`) so `topic-list.tsx`
 * and `topic-detail-screen.tsx` share one source of truth instead of two
 * inlined copies that could drift (REFINE Step 10 MEDIUM, 2026-09-29). */
export function topicDeleteConfirmCopy(): Readonly<{
  confirmLabel: string;
  message: string;
  title: string;
}> {
  return {
    confirmLabel: "삭제",
    message: "주제 대화방의 메시지와 사진·동영상도 모든 사람에게서 삭제됩니다.",
    title: "주제를 삭제할까요?",
  } as const;
}
