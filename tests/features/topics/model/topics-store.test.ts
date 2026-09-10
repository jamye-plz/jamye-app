import { createTopicsStore } from "@/features/topics/model/topics-store";
import {
  TopicsApiError,
  type TopicsApi,
} from "@/features/topics/data/topics-api";
import type { TopicsRepository } from "@/core/database/account/topics-types";
import { mapTopic } from "@/core/contracts/server";
import {
  authorId,
  groupId,
  topicId,
  otherId,
  key,
  topicWire,
} from "../topics-fixtures";

const topic = mapTopic(topicWire);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(userId = authorId) {
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
    updateTopic: jest.fn().mockResolvedValue({ ...topic, title: "수정" }),
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
  const getOwner = jest.fn().mockResolvedValue(otherId);
  const newKey = jest.fn().mockReturnValue(key);
  const store = createTopicsStore({
    api,
    repository,
    userId,
    getOwner,
    watchGroup,
    newKey,
    authorize: (execute, signal) =>
      execute("token", signal ?? new AbortController().signal),
  });
  return { store, api, repository, watchGroup, getOwner, newKey };
}

describe("M10 topics controller", () => {
  afterEach(() => jest.useRealTimers());
  test("loads canonical list and Seoul dates, changes filter without reusing cursor", async () => {
    const { store, api } = setup();
    api.listTopics.mockResolvedValueOnce({
      items: [topic],
      nextCursor: "page-2",
    });
    await store.actions.openGroup(groupId);
    expect(store.getState().dates?.today).toBe("2026-09-11");
    await store.actions.selectDate("2026-09-11");
    expect(api.listTopics).toHaveBeenLastCalledWith(
      "token",
      groupId,
      { date: "2026-09-11", limit: 20 },
      expect.anything(),
    );
    expect(store.getState().items).toEqual([topic]);
    store.dispose();
  });
  test("reuses exact creation intent after an uncertain response and refuses changed title", async () => {
    const { store, api } = setup();
    await store.actions.openGroup(groupId);
    api.createTopic.mockRejectedValueOnce(
      new TopicsApiError(0, "network_unavailable"),
    );
    expect(await store.actions.create(" 주제 ")).toBeNull();
    expect(store.getState().mutation.status).toBe("uncertain");
    await store.actions.create("다른 주제");
    expect(api.createTopic).toHaveBeenCalledTimes(1);
    expect(await store.actions.create(" 주제 ")).toEqual(topic);
    expect(api.createTopic.mock.calls.map((call) => call[2])).toEqual([
      { title: "주제", idempotencyKey: key },
      { title: "주제", idempotencyKey: key },
    ]);
    store.dispose();
  });
  test.each([403, 404, 422])(
    "allows a corrected creation intent after a definitive %s rejection",
    async (status) => {
      const { store, api, newKey } = setup();
      newKey.mockReturnValueOnce(key).mockReturnValueOnce(otherId);
      await store.actions.openGroup(groupId);
      api.createTopic.mockRejectedValueOnce(
        new TopicsApiError(status, "topic_rejected"),
      );
      expect(await store.actions.create("거부된 제목")).toBeNull();
      expect(store.getState().mutation.status).toBe("error");
      expect(await store.actions.create("고친 제목")).toEqual(topic);
      expect(api.createTopic.mock.calls.map((call) => call[2])).toEqual([
        { title: "거부된 제목", idempotencyKey: key },
        { title: "고친 제목", idempotencyKey: otherId },
      ]);
      store.dispose();
    },
  );
  test("never replaces a conflicting creation key automatically", async () => {
    const { store, api, newKey } = setup();
    await store.actions.openGroup(groupId);
    api.createTopic.mockRejectedValueOnce(
      new TopicsApiError(409, "idempotency_conflict"),
    );
    await store.actions.create("원래 제목");
    expect(await store.actions.create("바꾼 제목")).toBeNull();
    expect(api.createTopic).toHaveBeenCalledTimes(1);
    expect(newKey).toHaveBeenCalledTimes(1);
    expect(await store.actions.create("원래 제목")).toEqual(topic);
    expect(
      api.createTopic.mock.calls.map((call) => call[2].idempotencyKey),
    ).toEqual([key, key]);
    store.dispose();
  });
  test("appends topic and date pages once and stores the combined canonical list", async () => {
    const { store, api, repository } = setup();
    const nextTopic = { ...topic, id: otherId, tags: [] };
    api.listTopics
      .mockResolvedValueOnce({ items: [topic], nextCursor: "topic-page-2" })
      .mockResolvedValueOnce({ items: [topic, nextTopic], nextCursor: null });
    api.listDates
      .mockResolvedValueOnce({
        today: "2026-09-11",
        dates: ["2026-09-11"],
        nextCursor: "date-page-2",
      })
      .mockResolvedValueOnce({
        today: "2026-09-11",
        dates: ["2026-09-11", "2026-09-10"],
        nextCursor: null,
      });
    await store.actions.openGroup(groupId);
    await store.actions.moreTopics();
    expect(api.listTopics).toHaveBeenLastCalledWith(
      "token",
      groupId,
      { after: "topic-page-2", limit: 20 },
      expect.anything(),
    );
    expect(store.getState().items).toEqual([topic, nextTopic]);
    expect(repository.savePage).toHaveBeenCalledWith(groupId, "", {
      items: [topic, nextTopic],
      nextCursor: null,
    });
    await store.actions.moreDates();
    expect(api.listDates).toHaveBeenLastCalledWith(
      "token",
      groupId,
      { after: "date-page-2", limit: 31 },
      expect.anything(),
    );
    expect(store.getState().dates?.dates).toEqual(["2026-09-11", "2026-09-10"]);
    expect(repository.saveDates).toHaveBeenCalledWith(
      groupId,
      store.getState().dates,
    );
    await store.actions.moreTopics();
    await store.actions.moreDates();
    expect(api.listTopics).toHaveBeenCalledTimes(2);
    expect(api.listDates).toHaveBeenCalledTimes(2);
    store.dispose();
  });
  test("a pending page cannot leak into a different date and blocks duplicate pagination", async () => {
    const { store, api, repository } = setup();
    const pending = deferred<{
      items: (typeof topic)[];
      nextCursor: string | null;
    }>();
    api.listTopics.mockResolvedValueOnce({
      items: [topic],
      nextCursor: "page-2",
    });
    await store.actions.openGroup(groupId);
    api.listTopics.mockReturnValueOnce(pending.promise);
    const more = store.actions.moreTopics();
    await Promise.resolve();
    await store.actions.moreTopics();
    expect(api.listTopics).toHaveBeenCalledTimes(2);
    await store.actions.selectDate("2026-09-10");
    pending.resolve({ items: [{ ...topic, id: otherId }], nextCursor: null });
    await more;
    expect(store.getState().date).toBe("2026-09-10");
    expect(store.getState().items).toEqual([topic]);
    expect(repository.savePage).not.toHaveBeenCalled();
    expect(store.getState().loadingMore).toBe(false);
    store.dispose();
  });
  test.each(["list", "dates"] as const)(
    "rejects a cyclic %s cursor without overwriting cached pages",
    async (kind) => {
      const { store, api, repository } = setup();
      api.listTopics.mockResolvedValue({
        items: [topic],
        nextCursor: "same-page",
      });
      api.listDates.mockResolvedValue({
        today: "2026-09-11",
        dates: ["2026-09-11"],
        nextCursor: "same-page",
      });
      await store.actions.openGroup(groupId);
      await (kind === "list"
        ? store.actions.moreTopics()
        : store.actions.moreDates());
      expect(store.getState().error).not.toBeNull();
      expect(store.getState().loadingMore).toBe(false);
      expect(store.getState().datesBusy).toBe(false);
      expect(repository.savePage).not.toHaveBeenCalled();
      expect(repository.saveDates).not.toHaveBeenCalled();
      store.dispose();
    },
  );
  test.each(["list", "dates"] as const)(
    "rejects an empty nonterminal %s page and allows a later retry",
    async (kind) => {
      const { store, api, repository } = setup();
      api.listTopics.mockResolvedValueOnce({
        items: [topic],
        nextCursor: "page-2",
      });
      api.listDates.mockResolvedValueOnce({
        today: "2026-09-11",
        dates: ["2026-09-11"],
        nextCursor: "page-2",
      });
      await store.actions.openGroup(groupId);
      api.listTopics.mockResolvedValueOnce({ items: [], nextCursor: "page-3" });
      api.listDates.mockResolvedValueOnce({
        today: "2026-09-11",
        dates: [],
        nextCursor: "page-3",
      });
      const more =
        kind === "list" ? store.actions.moreTopics : store.actions.moreDates;
      await more();
      expect(store.getState().error).not.toBeNull();
      expect(repository.savePage).not.toHaveBeenCalled();
      expect(repository.saveDates).not.toHaveBeenCalled();
      await more();
      expect(store.getState().error).toBeNull();
      store.dispose();
    },
  );
  test("prevents double submit and never navigates a late creation into another group", async () => {
    const { store, api } = setup();
    await store.actions.openGroup(groupId);
    const pending = deferred<typeof topic>();
    api.createTopic.mockReturnValueOnce(pending.promise);
    const first = store.actions.create("주제");
    await Promise.resolve();
    expect(await store.actions.create("주제")).toBeNull();
    await store.actions.openGroup(otherId);
    pending.resolve(topic);
    expect(await first).toBeNull();
    expect(api.createTopic).toHaveBeenCalledTimes(1);
    expect(store.getState().groupId).toBe(otherId);
    store.dispose();
  });
  test("invalid second submit cannot unlock an in-flight create", async () => {
    const { store, api } = setup();
    await store.actions.openGroup(groupId);
    const pending = deferred<typeof topic>();
    api.createTopic.mockReturnValueOnce(pending.promise);
    const first = store.actions.create("주제");
    await Promise.resolve();
    await store.actions.create("");
    expect(store.getState().mutation.status).toBe("pending");
    await store.actions.create("다른 제목");
    expect(api.createTopic).toHaveBeenCalledTimes(1);
    pending.resolve(topic);
    await first;
    store.dispose();
  });
  test("owner can manage other author's tags but cannot edit body", async () => {
    const { store, api } = setup(otherId);
    await store.actions.openTopic(groupId, topicId);
    expect(store.getState().permissions).toEqual({
      canEdit: false,
      canManageTags: true,
    });
    await store.actions.edit({ title: "수정" });
    expect(api.updateTopic).not.toHaveBeenCalled();
    await store.actions.saveTags([]);
    expect(api.replaceTags).toHaveBeenCalled();
    store.dispose();
  });
  test("collects every tag page preserving AI metadata before whole-set replacement", async () => {
    const { store, api } = setup();
    const ai = {
      ...topic.tags[0]!,
      id: otherId,
      tag: "자동",
      source: "ai" as const,
      confidence: 0.75,
    };
    api.listTags
      .mockResolvedValueOnce({ items: topic.tags, nextCursor: "tags-2" })
      .mockResolvedValueOnce({ items: [ai], nextCursor: null });
    await store.actions.openTopic(groupId, topicId);
    expect(store.getState().detail.tagsComplete).toBe(true);
    expect(store.getState().detail.tags).toEqual([...topic.tags, ai]);
    await store.actions.saveTags([
      { tag: ai.tag, source: ai.source, confidence: ai.confidence },
    ]);
    expect(api.replaceTags.mock.calls[0]?.[3]).toEqual([
      { tag: "자동", source: "ai", confidence: 0.75 },
    ]);
    store.dispose();
  });
  test("failed or cyclic tag pagination cannot authorize destructive replacement", async () => {
    const { store, api } = setup();
    api.listTags.mockResolvedValue({ items: topic.tags, nextCursor: "loop" });
    await store.actions.openTopic(groupId, topicId);
    expect(store.getState().detail.tagsComplete).toBe(false);
    await store.actions.saveTags([]);
    expect(api.replaceTags).not.toHaveBeenCalled();
    store.dispose();
  });
  test("author permission failure hides editor without treating the whole group as lost", async () => {
    const { store, api, repository } = setup();
    await store.actions.openTopic(groupId, topicId);
    api.updateTopic.mockRejectedValue(
      new TopicsApiError(403, "topic_author_required"),
    );
    await store.actions.edit({ title: "수정" });
    expect(store.getState().accessLost).toBe(false);
    expect(store.getState().permissions.canEdit).toBe(false);
    expect(repository.invalidateGroup).not.toHaveBeenCalled();
    store.dispose();
  });
  test("membership loss clears topic data, denies mutations and invalidates only this group's cache", async () => {
    const { store, api, repository } = setup();
    await store.actions.openTopic(groupId, topicId);
    api.listTopics.mockRejectedValue(
      new TopicsApiError(403, "membership_required"),
    );
    await store.actions.refresh();
    expect(store.getState().accessLost).toBe(true);
    expect(store.getState().detail.topic).toBeNull();
    expect(store.getState().items).toEqual([]);
    await store.actions.create("주제");
    expect(api.createTopic).not.toHaveBeenCalled();
    expect(repository.invalidateGroup).toHaveBeenCalledWith(groupId);
    store.dispose();
  });
  test("stale detail and disposed-account responses cannot publish or write cache", async () => {
    const { store, api, repository } = setup();
    const pending = deferred<typeof topic>();
    api.getTopic.mockReturnValueOnce(pending.promise);
    const task = store.actions.openTopic(groupId, topicId);
    store.dispose();
    pending.resolve(topic);
    await task;
    expect(repository.saveTopic).not.toHaveBeenCalled();
    expect(store.getState().detail.topic).toBeNull();
  });
  test("uses captured dirty markers only after a successful snapshot; failure retains them", async () => {
    const { store, api, repository } = setup();
    const markers = [{ chatroomId: topic.chatroomId, markerEventId: "e1" }];
    repository.listDirtyMarkers.mockResolvedValue(markers);
    await store.actions.openGroup(groupId);
    expect(repository.reconcileGroup).toHaveBeenCalledWith(
      expect.objectContaining({ groupId, markers }),
      expect.any(AbortSignal),
    );
    repository.reconcileGroup.mockClear();
    api.listDates.mockRejectedValue(
      new TopicsApiError(503, "database_unavailable"),
    );
    await store.actions.refresh();
    expect(repository.reconcileGroup).not.toHaveBeenCalled();
    store.dispose();
  });
  test("coalesces sync activity, ignores background and recovers on foreground", async () => {
    jest.useFakeTimers();
    const { store, api } = setup();
    await store.actions.openGroup(groupId);
    for (let i = 0; i < 10; i++) store.actions.signal();
    await jest.advanceTimersByTimeAsync(250);
    expect(api.listTopics).toHaveBeenCalledTimes(2);
    store.actions.background();
    store.actions.signal();
    await jest.advanceTimersByTimeAsync(500);
    expect(api.listTopics).toHaveBeenCalledTimes(2);
    await store.actions.foreground();
    expect(api.listTopics).toHaveBeenCalledTimes(3);
    store.dispose();
  });
  test("renders same-account cached list during a slow refresh after restart", async () => {
    const { store, api, repository } = setup();
    repository.getPage.mockResolvedValue({ items: [topic], nextCursor: null });
    const pending = deferred<{ items: (typeof topic)[]; nextCursor: null }>();
    api.listTopics.mockReturnValueOnce(pending.promise);
    const load = store.actions.openGroup(groupId);
    await new Promise<void>((done) => setImmediate(done));
    expect(store.getState().items).toEqual([topic]);
    expect(store.getState().status).toBe("loading");
    pending.resolve({ items: [topic], nextCursor: null });
    await load;
    store.dispose();
  });
  test("foreground preserves the active editor instead of reloading it out from under the draft", async () => {
    const { store, api } = setup();
    await store.actions.openTopic(groupId, topicId);
    store.actions.setEditing(true);
    store.actions.background();
    await store.actions.foreground();
    expect(api.getTopic).toHaveBeenCalledTimes(1);
    expect(store.getState().detail.topic).toEqual(topic);
    store.actions.setEditing(false);
    store.dispose();
  });
  test("switching topic within a group fences a late edit", async () => {
    const { store, api } = setup();
    await store.actions.openTopic(groupId, topicId);
    const pending = deferred<typeof topic>();
    api.updateTopic.mockReturnValueOnce(pending.promise);
    const edit = store.actions.edit({ title: "旧" });
    api.getTopic.mockResolvedValue({ ...topic, id: otherId });
    await store.actions.openTopic(groupId, otherId);
    pending.resolve({ ...topic, title: "旧" });
    await edit;
    expect(store.getState().detail.topic?.id).toBe(otherId);
    store.dispose();
  });
  test("reopening the same group interrupts creation without trapping its exact retry in pending", async () => {
    const { store, api } = setup();
    await store.actions.openGroup(groupId);
    const pending = deferred<typeof topic>();
    api.createTopic.mockReturnValueOnce(pending.promise);
    const creation = store.actions.create("이전 시도");
    await store.actions.openGroup(groupId);
    expect(store.getState().mutation.status).toBe("uncertain");
    pending.resolve(topic);
    expect(await creation).toBeNull();
    await store.actions.create("이전 시도");
    expect(api.createTopic).toHaveBeenCalledTimes(2);
    expect(api.createTopic.mock.calls[1]?.[2]).toEqual(
      api.createTopic.mock.calls[0]?.[2],
    );
    store.dispose();
  });
});
