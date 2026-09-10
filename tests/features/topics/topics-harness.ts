import {
  createTopicsStore,
  type AuthorizedTopicsRequest,
  type TopicsStore,
} from "@/features/topics/model/topics-store";
import { mapTopic } from "@/core/contracts/server";
import type { TopicsApi } from "@/features/topics/data/topics-api";
import type { TopicsRepository } from "@/core/database/account/topics-types";
import type { TopicsStoreFactory } from "@/features/topics/model/topics-provider";
import { authorId, otherId, key, topicWire } from "./topics-fixtures";

export const authorize: AuthorizedTopicsRequest = (execute, signal) =>
  execute("test-token", signal ?? new AbortController().signal);
export function topicsHarness() {
  const topic = mapTopic(topicWire);
  const principal = {
    origin: "https://api.example.com",
    userId: authorId,
    epoch: 1,
  };
  const api: jest.Mocked<TopicsApi> = {
    createTopic: jest.fn().mockResolvedValue(topic),
    listTopics: jest
      .fn()
      .mockResolvedValue({ items: [topic], nextCursor: null }),
    listDates: jest.fn().mockResolvedValue({
      today: "2026-09-11",
      dates: ["2026-09-11"],
      nextCursor: null,
    }),
    getTopic: jest.fn().mockResolvedValue(topic),
    updateTopic: jest.fn().mockResolvedValue({ ...topic, title: "새 제목" }),
    listTags: jest
      .fn()
      .mockResolvedValue({ items: topic.tags, nextCursor: null }),
    replaceTags: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
  };
  const repository: jest.Mocked<TopicsRepository> = {
    getTopic: jest.fn().mockResolvedValue(null),
    getPage: jest.fn().mockResolvedValue(null),
    getDates: jest.fn().mockResolvedValue(null),
    saveTopic: jest.fn().mockResolvedValue(undefined),
    savePage: jest.fn().mockResolvedValue(undefined),
    saveDates: jest.fn().mockResolvedValue(undefined),
    listDirtyMarkers: jest.fn().mockResolvedValue([]),
    reconcileGroup: jest.fn().mockResolvedValue(undefined),
    invalidateGroup: jest.fn().mockResolvedValue(undefined),
  };
  const watchGroup = jest.fn().mockResolvedValue(undefined);
  const unsubscribe = jest.fn();
  const subscribeSync = jest.fn(
    (_listener: (event: "changed" | "connected" | "evicted") => void) =>
      unsubscribe,
  );
  const stores: TopicsStore[] = [];
  const createStore: jest.MockedFunction<TopicsStoreFactory> = jest.fn(
    (identity, repo, authorization, watch) => {
      const store = createTopicsStore({
        api,
        repository: repo,
        userId: identity.userId,
        authorize: authorization,
        watchGroup: watch,
        newKey: () => key,
        getOwner: async () => otherId,
      });
      stores.push(store);
      return store;
    },
  );
  return {
    api,
    repository,
    principal,
    topic,
    watchGroup,
    subscribeSync,
    unsubscribe,
    createStore,
    stores,
  };
}
