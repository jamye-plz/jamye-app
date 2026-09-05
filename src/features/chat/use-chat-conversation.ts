import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DatabaseRepository,
  Message,
} from "@/core/database/repositories/database-repository";

import { mergeMessageWindow } from "./model/chat-message-window";

const PAGE_LIMIT = 30;

type MessageCursor = Readonly<{ createdAtMs: number; localId: string }>;

export type ChatConversation = Readonly<{
  hasMore: boolean;
  initialPageStatus: "error" | "loading" | "ready";
  items: Message[];
  loadOlder: () => Promise<void>;
  olderPageStatus: "error" | "idle" | "loading";
  retryInitialPage: () => Promise<void>;
}>;

type ConversationState = Omit<
  ChatConversation,
  "loadOlder" | "retryInitialPage"
> &
  Readonly<{ nextBefore: MessageCursor | null }>;

const initialState: ConversationState = {
  hasMore: false,
  initialPageStatus: "loading",
  items: [],
  nextBefore: null,
  olderPageStatus: "idle",
};

export function useChatConversation(
  input: Readonly<{
    conversationId: string;
    repository: Pick<DatabaseRepository, "listMessagesPage" | "subscribe">;
  }>,
): ChatConversation {
  const [state, setState] = useState<ConversationState>(initialState);
  const stateRef = useRef(state);
  const initialPageRequestRef = useRef<(() => Promise<void>) | undefined>(
    undefined,
  );
  const requestInFlightRef = useRef(false);

  const publish = useCallback((next: ConversationState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let active = true;
    let initialPageInFlight = false;
    let pendingFollowUpRefresh = false;

    const queryNewestPage = async () =>
      await input.repository.listMessagesPage({
        before: null,
        conversationId: input.conversationId,
        limit: PAGE_LIMIT,
      });

    const publishNewestPage = (
      page: Awaited<ReturnType<typeof queryNewestPage>>,
      nextInitialPageStatus: ConversationState["initialPageStatus"],
    ) => {
      const previous = stateRef.current;
      publish({
        ...previous,
        hasMore: previous.items.length === 0 ? page.hasMore : previous.hasMore,
        initialPageStatus: nextInitialPageStatus,
        items: mergeMessageWindow(previous.items, page.items),
        nextBefore:
          previous.items.length === 0 ? page.nextBefore : previous.nextBefore,
      });
    };

    const runInitialPageRequest = async () => {
      if (initialPageInFlight) return;

      initialPageInFlight = true;
      publish({ ...stateRef.current, initialPageStatus: "loading" });
      try {
        const page = await queryNewestPage();
        if (!active) return;
        publishNewestPage(page, "ready");
      } catch {
        if (!active) return;
        publish({ ...stateRef.current, initialPageStatus: "error" });
      } finally {
        initialPageInFlight = false;
        if (active && pendingFollowUpRefresh) {
          pendingFollowUpRefresh = false;
          void refreshNewestPage().catch(() => undefined);
        }
      }
    };

    const refreshNewestPage = async () => {
      if (initialPageInFlight) return;
      const page = await input.repository.listMessagesPage({
        before: null,
        conversationId: input.conversationId,
        limit: PAGE_LIMIT,
      });
      if (!active) return;
      publishNewestPage(page, "ready");
    };

    initialPageRequestRef.current = runInitialPageRequest;
    void runInitialPageRequest();
    const unsubscribe = input.repository.subscribe((change) => {
      if (change.conversationId !== input.conversationId) return;
      if (initialPageInFlight) {
        pendingFollowUpRefresh = true;
        return;
      }
      void refreshNewestPage().catch(() => undefined);
    });

    return () => {
      active = false;
      if (initialPageRequestRef.current === runInitialPageRequest) {
        initialPageRequestRef.current = undefined;
      }
      unsubscribe();
    };
  }, [input.conversationId, input.repository, publish]);

  const retryInitialPage = useCallback(async () => {
    if (stateRef.current.initialPageStatus !== "error") return;
    await initialPageRequestRef.current?.();
  }, []);

  const loadOlder = useCallback(async () => {
    const snapshot = stateRef.current;
    if (
      requestInFlightRef.current ||
      !snapshot.hasMore ||
      snapshot.nextBefore === null
    ) {
      return;
    }

    requestInFlightRef.current = true;
    publish({ ...snapshot, olderPageStatus: "loading" });
    try {
      const page = await input.repository.listMessagesPage({
        before: snapshot.nextBefore,
        conversationId: input.conversationId,
        limit: PAGE_LIMIT,
      });
      const current = stateRef.current;
      publish({
        hasMore: page.hasMore,
        initialPageStatus: current.initialPageStatus,
        items: mergeMessageWindow(current.items, page.items),
        nextBefore: page.nextBefore,
        olderPageStatus: "idle",
      });
    } catch {
      publish({ ...stateRef.current, olderPageStatus: "error" });
    } finally {
      requestInFlightRef.current = false;
    }
  }, [input.conversationId, input.repository, publish]);

  return { ...state, loadOlder, retryInitialPage };
}
