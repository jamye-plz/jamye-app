import type { Topic } from "@/core/contracts/server";

export type TopicListLoadMore = Readonly<{
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}>;

export type TopicListProps = Readonly<{
  /** True once the query settled with no topics for the selected date. */
  empty: boolean;
  loadMore: TopicListLoadMore | null;
  onOpenChat: (topic: Topic) => void;
  onOpenDetail: (topic: Topic) => void;
  /**
   * Trailing swipe 삭제. Rendered only when provided: the server has no topic
   * delete contract until M15 (T8 `DELETE …/topics/{topic_id}`), so the group
   * home leaves it undefined for now.
   */
  onDelete?: (topic: Topic) => void;
  onRefresh: () => Promise<void>;
  topics: readonly Topic[];
}>;
