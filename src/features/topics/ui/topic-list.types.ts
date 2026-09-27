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
}>;
