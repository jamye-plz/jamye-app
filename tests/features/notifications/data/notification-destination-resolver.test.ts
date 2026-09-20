import { createNotificationDestinationResolver } from "@/features/notifications/data/notification-destination-resolver";
import type {
  CachedChatroomLocation,
  LocalChatroomCachePort,
} from "@/features/notifications/data/notification-destination-resolver";

const conversationId = "22222222-2222-4222-8222-222222222222";
const groupId = "11111111-1111-4111-8111-111111111111";
const topicId = "33333333-3333-4333-8333-333333333333";

function makeLocalCache(
  initial: CachedChatroomLocation | null = null,
): LocalChatroomCachePort & { upserted: CachedChatroomLocation[] } {
  const upserted: CachedChatroomLocation[] = [];
  return {
    upserted,
    async findByChatroomId(chatroomId) {
      return initial && initial.chatroomId === chatroomId ? initial : null;
    },
    async upsertChatroom(location) {
      upserted.push(location);
    },
  };
}

describe("M12 notification destination resolver", () => {
  test("resolves a local cache hit synchronously, with no network call", async () => {
    const localCache = makeLocalCache({
      chatroomId: conversationId,
      createdAtRaw: "2026-09-16T00:00:00Z",
      groupId,
      kind: "main",
      topicId: null,
    });
    const listGroupChatrooms = jest.fn();
    const listGroups = jest.fn();
    const resolver = createNotificationDestinationResolver(
      localCache,
      { listGroupChatrooms },
      { listGroups },
    );

    await expect(resolver.resolve("t", conversationId)).resolves.toEqual({
      chatroomId: conversationId,
      groupId,
      kind: "main",
      status: "resolved",
      topicId: null,
    });
    expect(listGroups).not.toHaveBeenCalled();
    expect(listGroupChatrooms).not.toHaveBeenCalled();
  });

  test("falls back to G2+C1 scan on a cache miss, resolving a topic chatroom and writing the cache back", async () => {
    const localCache = makeLocalCache(null);
    const listGroups = jest
      .fn()
      .mockResolvedValue({ items: [{ id: groupId }], nextCursor: null });
    const listGroupChatrooms = jest.fn().mockResolvedValue({
      items: [
        {
          createdAt: "2026-09-16T00:00:00Z",
          groupId,
          id: conversationId,
          topicId,
          type: "topic",
        },
      ],
      nextCursor: null,
    });
    const resolver = createNotificationDestinationResolver(
      localCache,
      { listGroupChatrooms },
      { listGroups },
    );

    await expect(resolver.resolve("t", conversationId)).resolves.toEqual({
      chatroomId: conversationId,
      groupId,
      kind: "topic",
      status: "resolved",
      topicId,
    });
    expect(localCache.upserted).toEqual([
      {
        chatroomId: conversationId,
        createdAtRaw: "2026-09-16T00:00:00Z",
        groupId,
        kind: "topic",
        topicId,
      },
    ]);
  });

  test("paginates both G2 groups and C1 chatrooms until a match is found", async () => {
    const localCache = makeLocalCache(null);
    const listGroups = jest
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: "group-a" }],
        nextCursor: "groups-cursor-1",
      })
      .mockResolvedValueOnce({ items: [{ id: groupId }], nextCursor: null });
    const listGroupChatrooms = jest
      .fn()
      .mockImplementation(async (_token: string, candidateGroupId: string) => {
        if (candidateGroupId === "group-a") {
          return { items: [], nextCursor: null };
        }
        return {
          items: [
            {
              createdAt: "2026-09-16T00:00:00Z",
              groupId,
              id: conversationId,
              topicId: null,
              type: "main",
            },
          ],
          nextCursor: null,
        };
      });
    const resolver = createNotificationDestinationResolver(
      localCache,
      { listGroupChatrooms },
      { listGroups },
    );

    await expect(resolver.resolve("t", conversationId)).resolves.toEqual({
      chatroomId: conversationId,
      groupId,
      kind: "main",
      status: "resolved",
      topicId: null,
    });
    expect(listGroups).toHaveBeenCalledTimes(2);
  });

  test("resolves not_found when the scan exhausts with no match", async () => {
    const localCache = makeLocalCache(null);
    const listGroups = jest
      .fn()
      .mockResolvedValue({ items: [{ id: groupId }], nextCursor: null });
    const listGroupChatrooms = jest
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null });
    const resolver = createNotificationDestinationResolver(
      localCache,
      { listGroupChatrooms },
      { listGroups },
    );

    await expect(resolver.resolve("t", conversationId)).resolves.toEqual({
      status: "not_found",
    });
    expect(localCache.upserted).toEqual([]);
  });

  test("resolves unauthorized when C1 returns 403 during the fallback scan", async () => {
    const localCache = makeLocalCache(null);
    const listGroups = jest
      .fn()
      .mockResolvedValue({ items: [{ id: groupId }], nextCursor: null });
    const listGroupChatrooms = jest
      .fn()
      .mockRejectedValue({ status: 403, code: "forbidden" });
    const resolver = createNotificationDestinationResolver(
      localCache,
      { listGroupChatrooms },
      { listGroups },
    );

    await expect(resolver.resolve("t", conversationId)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  test("resolves unauthorized when G2 returns 404 during the fallback scan", async () => {
    const localCache = makeLocalCache(null);
    const listGroups = jest
      .fn()
      .mockRejectedValue({ status: 404, code: "not_found" });
    const listGroupChatrooms = jest.fn();
    const resolver = createNotificationDestinationResolver(
      localCache,
      { listGroupChatrooms },
      { listGroups },
    );

    await expect(resolver.resolve("t", conversationId)).resolves.toEqual({
      status: "unauthorized",
    });
    expect(listGroupChatrooms).not.toHaveBeenCalled();
  });

  test("propagates non-403/404 errors instead of swallowing them into a resolution state", async () => {
    const localCache = makeLocalCache(null);
    const listGroups = jest.fn().mockRejectedValue({ status: 500 });
    const listGroupChatrooms = jest.fn();
    const resolver = createNotificationDestinationResolver(
      localCache,
      { listGroupChatrooms },
      { listGroups },
    );

    await expect(resolver.resolve("t", conversationId)).rejects.toEqual({
      status: 500,
    });
  });
});
