import { createTopicsApi } from "@/features/topics/data/topics-api";
import {
  groupId,
  topicId,
  roomId,
  otherId,
  key,
  tagWire,
  topicWire,
} from "../topics-fixtures";

describe("M10 T1-T7 contract transport", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  const api = createTopicsApi("https://api.example.com/");
  const reply = (value: unknown, status = 200) =>
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(value),
      headers: { get: () => null },
    });
  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  test.each([201, 200])(
    "T1 accepts %s and retains the UUID idempotency key",
    async (status) => {
      reply(topicWire, status);
      const value = await api.createTopic("token", groupId, {
        title: "  제목 😀  ",
        idempotencyKey: key,
      });
      expect(value).toMatchObject({
        id: topicId,
        groupId,
        chatroomId: roomId,
        authorNickname: "작성자",
        unread: false,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.example.com/api/v1/groups/${groupId}/topics`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "제목 😀" }),
          credentials: "omit",
          redirect: "error",
          headers: expect.objectContaining({
            Authorization: "Bearer token",
            "Idempotency-Key": key,
          }),
        }),
      );
    },
  );
  test("T2 and T3 preserve Seoul today, dates and opaque pagination", async () => {
    const cursor = "a+/=%? &끝";
    reply({
      today: "2026-09-11",
      dates: ["2026-09-11", "2026-09-10"],
      next_cursor: cursor,
    });
    await expect(
      api.listDates("t", groupId, { limit: 366, after: cursor }),
    ).resolves.toEqual({
      today: "2026-09-11",
      dates: ["2026-09-11", "2026-09-10"],
      nextCursor: cursor,
    });
    reply({ items: [topicWire], next_cursor: cursor });
    const page = await api.listTopics("t", groupId, {
      date: "2026-09-11",
      after: cursor,
      limit: 100,
    });
    expect(page.items[0]).toMatchObject({ id: topicId, groupId });
    expect(page.nextCursor).toBe(cursor);
    const url = new URL(fetchMock.mock.calls[1][0]);
    expect(url.searchParams.get("after")).toBe(cursor);
    expect(url.searchParams.get("date")).toBe("2026-09-11");
  });
  test("T4/T5 use canonical detail and nullable patch fields", async () => {
    reply(topicWire);
    expect((await api.getTopic("t", groupId, topicId)).chatroomId).toBe(roomId);
    await api.updateTopic("t", groupId, topicId, { title: null, body: "본문" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      body: '{"title":null,"body":"본문"}',
    });
  });
  test("T6/T7 preserve tag metadata and allow an empty whole-list replacement", async () => {
    reply({ items: [tagWire], next_cursor: "opaque" });
    const page = await api.listTags("t", groupId, topicId, { limit: 100 });
    expect(page.items[0]).toEqual({
      id: key,
      topicId,
      tag: "여행",
      source: "user",
      confidence: null,
    });
    expect(page.nextCursor).toBe("opaque");
    reply({ items: [], next_cursor: null });
    await api.replaceTags("t", groupId, topicId, [
      { tag: "  분류 ", source: "ai", confidence: 0.75 },
    ]);
    expect(fetchMock.mock.calls[1][1].body).toBe(
      '{"tags":[{"tag":"분류","source":"ai","confidence":0.75}]}',
    );
    await api.replaceTags("t", groupId, topicId, []);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: "PUT",
      body: '{"tags":[]}',
    });
  });
  test("T5 preserves body whitespace and newlines while normalizing the title", async () => {
    reply(topicWire);
    await api.updateTopic("t", groupId, topicId, {
      title: " 제목 ",
      body: "  첫 줄\n둘째 줄  \n",
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ title: "제목", body: "  첫 줄\n둘째 줄  \n" }),
    });
  });
  test.each(["", "  ", "😀".repeat(257)])(
    "rejects invalid title before I/O",
    async (title) => {
      await expect(
        api.createTopic("t", groupId, { title, idempotencyKey: key }),
      ).rejects.toMatchObject({ status: 422 });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  test("accepts the 256 Unicode-scalar title boundary", async () => {
    reply(topicWire, 201);
    await api.createTopic("t", groupId, {
      title: "😀".repeat(256),
      idempotencyKey: key,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  test("rejects invalid identifiers, key, date, page limits and empty body before I/O", async () => {
    for (const action of [
      () => api.getTopic("t", "../groups", topicId),
      () => api.getTopic("t", groupId, ".."),
      () =>
        api.createTopic("t", groupId, {
          title: "제목",
          idempotencyKey: "invalid",
        }),
      () => api.listTopics("t", groupId, { date: "2026-02-30" }),
      () => api.listDates("t", groupId, { limit: 367 }),
      () => api.listTopics("t", groupId, { limit: 0 }),
      () => api.listTags("t", groupId, topicId, { limit: 1.5 }),
      () => api.updateTopic("t", groupId, topicId, { body: " " }),
      () =>
        api.replaceTags("t", groupId, topicId, [
          { tag: "중복", source: "user" },
          { tag: " 중복 ", source: "user" },
        ]),
      () =>
        api.replaceTags("t", groupId, topicId, [
          { tag: "x".repeat(65), source: "user" },
        ]),
      () =>
        api.replaceTags("t", groupId, topicId, [
          { tag: "태그", source: "ai", confidence: 2 },
        ]),
    ])
      await expect(action()).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test.each([
    { ...topicWire, group_id: otherId },
    { ...topicWire, id: otherId },
    { ...topicWire, unread: "false" },
    { ...topicWire, tags: [{ ...tagWire, topic_id: otherId }] },
    { ...topicWire, media: [{ id: key }] },
  ])("rejects malformed/cross-scope detail", async (wire) => {
    reply(wire);
    await expect(api.getTopic("t", groupId, topicId)).rejects.toMatchObject({
      status: 502,
    });
  });
  test("rejects cross-group pages and cross-topic tags", async () => {
    reply({ items: [{ ...topicWire, group_id: otherId }], next_cursor: null });
    await expect(api.listTopics("t", groupId, {})).rejects.toMatchObject({
      status: 502,
    });
    reply({ items: [{ ...tagWire, topic_id: otherId }], next_cursor: null });
    await expect(api.listTags("t", groupId, topicId, {})).rejects.toMatchObject(
      { status: 502 },
    );
  });
  test.each([401, 403, 404, 409, 422, 503])(
    "keeps safe error code and status %s without raw secrets",
    async (status) => {
      reply(
        {
          error: {
            code: "topic_author_required",
            message: "secret-input",
            request_id: key,
          },
        },
        status,
      );
      try {
        await api.getTopic("t", groupId, topicId);
        throw new Error("expected rejection");
      } catch (error) {
        expect(error).toMatchObject({ status });
        expect(String(error)).not.toContain("secret-input");
      }
    },
  );
  test("unexpected success status and invalid JSON are not accepted", async () => {
    reply(topicWire, 202);
    await expect(api.getTopic("t", groupId, topicId)).rejects.toMatchObject({
      status: 502,
    });
    reply({ bogus: true });
    await expect(api.getTopic("t", groupId, topicId)).rejects.toMatchObject({
      status: 502,
    });
  });
  test("network failures and caller cancellation are safe and distinguishable", async () => {
    fetchMock.mockRejectedValue(new Error("secret-url"));
    await expect(api.getTopic("t", groupId, topicId)).rejects.toMatchObject({
      status: 0,
      code: "network_unavailable",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.getTopic("t", groupId, topicId, controller.signal),
    ).rejects.toMatchObject({ code: "request_cancelled" });
  });
});
