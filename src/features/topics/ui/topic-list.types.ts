import type { Topic } from "@/core/contracts/server";

export type TopicListTopError = Readonly<{
  message: string;
  onRetry: () => void;
}>;

export type TopicListLoadMore = Readonly<{
  isLoading: boolean;
  onVisible: () => void;
}>;

export type TopicListProps = Readonly<{
  onOpenChat: (topic: Topic) => void;
  onRefresh: () => Promise<void>;
  /** Auto-load sentinel row at the end of the list; `null` when there is no
   * next page (C1's "더 보기" is automatic, not a button). */
  loadMore: TopicListLoadMore | null;
  /** iOS-only inline top-of-list pagination error (C1's "행 있음" error
   * path); Android surfaces the same failure through a Snackbar instead, see
   * `topics-screen.tsx`. */
  topError?: TopicListTopError | null;
  testID?: string;
  topics: readonly Topic[];
  /**
   * M15/AC3/E11: the signed-in user's id, to gate the row delete action to
   * author rows only (`topic.authorId === currentUserId`); `null` while the
   * session isn't ready yet renders every row without the action, same as
   * before M15.
   */
  currentUserId: string | null;
  /** M15/AC1/AC5: called with the row's topic after `ConfirmAlert` confirms
   * a delete request from that row's swipe/context-menu/long-press action. */
  onDeleteConfirmed: (topic: Topic) => void;
}>;
