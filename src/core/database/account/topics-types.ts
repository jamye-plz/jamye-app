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
}>;
