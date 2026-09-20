import type { ChatApi } from "@/features/chat/data/chat-api";
import type { GroupsApi } from "@/features/groups/data/groups-api";

/**
 * Local cache row shape, structurally identical to
 * `ConnectedChatroom`/`ConnectedChatroomUpsert`
 * (`@/core/database/account/connected-chat-types`). This file intentionally
 * does not import the concrete repository module (out of A1's scope); the
 * tier-2 task that wires this resolver into the app is responsible for
 * passing an adapter over the real account-scoped `connected_chatrooms`
 * table that satisfies this port.
 */
export type CachedChatroomLocation = Readonly<{
  chatroomId: string;
  groupId: string;
  kind: "main" | "topic";
  topicId: string | null;
  createdAtRaw: string;
}>;

export type LocalChatroomCachePort = Readonly<{
  findByChatroomId: (
    chatroomId: string,
  ) => Promise<CachedChatroomLocation | null>;
  upsertChatroom: (location: CachedChatroomLocation) => Promise<void>;
}>;

export type NotificationDestination =
  | Readonly<{
      status: "resolved";
      groupId: string;
      kind: "main" | "topic";
      chatroomId: string;
      topicId: string | null;
    }>
  | Readonly<{ status: "unauthorized" }>
  | Readonly<{ status: "not_found" }>;

export type NotificationDestinationResolver = Readonly<{
  resolve: (
    accessToken: string,
    conversationId: string,
    signal?: AbortSignal,
  ) => Promise<NotificationDestination>;
}>;

/** Guards against a pathological search (e.g. a mocked port returning an
 * ever-advancing cursor); real G2/C1 pages are bounded by the server. */
const MAX_SCAN_PAGES = 200;

function isAuthorizationFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    ((error as { status: unknown }).status === 403 ||
      (error as { status: unknown }).status === 404)
  );
}

export function createNotificationDestinationResolver(
  localCache: LocalChatroomCachePort,
  chatApi: Pick<ChatApi, "listGroupChatrooms">,
  groupsApi: Pick<GroupsApi, "listGroups">,
): NotificationDestinationResolver {
  return {
    async resolve(accessToken, conversationId, signal) {
      const cached = await localCache.findByChatroomId(conversationId);
      if (cached) {
        return {
          chatroomId: cached.chatroomId,
          groupId: cached.groupId,
          kind: cached.kind,
          status: "resolved",
          topicId: cached.topicId,
        };
      }

      let groupsAfter: string | undefined;
      for (
        let groupPageIndex = 0;
        groupPageIndex < MAX_SCAN_PAGES;
        groupPageIndex += 1
      ) {
        let groupPage;
        try {
          groupPage = await groupsApi.listGroups(
            accessToken,
            { after: groupsAfter, limit: 100 },
            signal,
          );
        } catch (error) {
          if (isAuthorizationFailure(error)) return { status: "unauthorized" };
          throw error;
        }

        for (const group of groupPage.items) {
          let chatroomsAfter: string | undefined;
          for (
            let chatroomPageIndex = 0;
            chatroomPageIndex < MAX_SCAN_PAGES;
            chatroomPageIndex += 1
          ) {
            let chatroomPage;
            try {
              chatroomPage = await chatApi.listGroupChatrooms(
                accessToken,
                group.id,
                { after: chatroomsAfter, limit: 100 },
                signal,
              );
            } catch (error) {
              if (isAuthorizationFailure(error))
                return { status: "unauthorized" };
              throw error;
            }

            const match = chatroomPage.items.find(
              (chatroom) => chatroom.id === conversationId,
            );
            if (match) {
              const kind: "main" | "topic" =
                match.type === "topic" ? "topic" : "main";
              await localCache.upsertChatroom({
                chatroomId: match.id,
                createdAtRaw: match.createdAt,
                groupId: match.groupId,
                kind,
                topicId: match.topicId,
              });
              return {
                chatroomId: match.id,
                groupId: match.groupId,
                kind,
                status: "resolved",
                topicId: match.topicId,
              };
            }

            if (chatroomPage.nextCursor === null) break;
            chatroomsAfter = chatroomPage.nextCursor;
          }
        }

        if (groupPage.nextCursor === null) break;
        groupsAfter = groupPage.nextCursor;
      }

      return { status: "not_found" };
    },
  };
}
