import type {
  Topic,
  TopicDatePage,
  TopicPage,
} from "../../contracts/server/topics";

export type TopicDirtyMarker = Readonly<{
  chatroomId: string;
  markerEventId: string;
}>;
export type TopicGroupSnapshot = Readonly<{
  groupId: string;
  date: string;
  dates: TopicDatePage;
  page: TopicPage;
  markers: readonly TopicDirtyMarker[];
}>;
/** M15 AC8: an author's current display as read from a T3 list page or a T4
 * detail response (never cache hydration). `authorNickname` mirrors
 * `Topic.authorNickname` (server always returns a display string, e.g. "탈퇴한
 * 사용자" after account deletion -- never null). */
export type TopicAuthorIdentity = Readonly<{
  authorId: string;
  authorNickname: string;
  authorAvatarUrl: string | null;
}>;
export type TopicsRepository = Readonly<{
  getTopic: (groupId: string, topicId: string) => Promise<Topic | null>;
  getPage: (groupId: string, date: string) => Promise<TopicPage | null>;
  getDates: (groupId: string) => Promise<TopicDatePage | null>;
  saveTopic: (topic: Topic) => Promise<void>;
  savePage: (groupId: string, date: string, page: TopicPage) => Promise<void>;
  saveDates: (groupId: string, dates: TopicDatePage) => Promise<void>;
  listDirtyMarkers: (groupId: string) => Promise<readonly TopicDirtyMarker[]>;
  reconcileGroup: (
    input: TopicGroupSnapshot,
    signal?: AbortSignal,
  ) => Promise<void>;
  invalidateGroup: (groupId: string) => Promise<void>;
  /** M15 AC8: applies each deduped author's current identity (from a T3/T4
   * network response) to every local connected_chat_messages row for that
   * sender_id, tombstones included -- same shared SQL as connected-chat's
   * history-merge propagation (r3/defect 10), see
   * connected-chat-repository.ts's propagateSenderIdentity. A no-op for an
   * empty list. */
  refreshAuthorIdentities: (
    identities: readonly TopicAuthorIdentity[],
  ) => Promise<void>;
}>;
