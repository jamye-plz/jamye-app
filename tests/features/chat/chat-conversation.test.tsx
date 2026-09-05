import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";
import React from "react";

type Message = Readonly<{
  body: string;
  clientMsgId: string | null;
  conversationId: string;
  createdAtMs: number;
  eventId: string | null;
  localId: string;
  senderId: string;
  serverSequence: number | null;
  status: "failed" | "pending" | "sent";
}>;

type MessageCursor = Readonly<{ createdAtMs: number; localId: string }>;
type DatabaseChange = Readonly<{ conversationId: string; kind: string }>;
type MessagePage = Readonly<{
  hasMore: boolean;
  items: Message[];
  nextBefore: MessageCursor | null;
}>;
type RepositoryPort = Readonly<{
  listMessagesPage: (
    input: Readonly<{
      before: MessageCursor | null;
      conversationId: string;
      limit: number;
    }>,
  ) => Promise<MessagePage>;
  subscribe: (listener: (change: DatabaseChange) => void) => () => void;
}>;

type ChatConversation = Readonly<{
  hasMore: boolean;
  initialPageStatus: "error" | "loading" | "ready";
  items: Message[];
  loadOlder: () => Promise<void>;
  olderPageStatus: "error" | "idle" | "loading";
  retryInitialPage: () => Promise<void>;
}>;
type ChatConversationModule = { useChatConversation?: unknown };
type UseChatConversation = (
  input: Readonly<{
    conversationId: string;
    repository: RepositoryPort;
  }>,
) => ChatConversation;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error.code === "MODULE_NOT_FOUND" ||
      (typeof error.message === "string" &&
        error.message.includes("Cannot find module")))
  );
}

function loadUseChatConversation(): UseChatConversation {
  let module: ChatConversationModule;
  try {
    module = jest.requireActual<ChatConversationModule>(
      "../../../src/features/chat/use-chat-conversation",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M5-UI-1 implementation missing: use-chat-conversation.ts must export useChatConversation({ conversationId, repository }).",
      );
    }
    throw error;
  }
  if (typeof module.useChatConversation !== "function") {
    throw new Error(
      "M5-UI-1 useChatConversation contract is incomplete: expected only conversationId and repository input.",
    );
  }
  return module.useChatConversation as UseChatConversation;
}

function message(
  localId: string,
  createdAtMs: number,
  overrides?: Partial<Message>,
): Message {
  return {
    body: localId,
    clientMsgId: null,
    conversationId: "fixture-conversation",
    createdAtMs,
    eventId: null,
    localId,
    senderId: "fixture-sender",
    serverSequence: null,
    status: "sent",
    ...overrides,
  };
}

function createDeferred<Value>() {
  let reject: (error: Error) => void = () => undefined;
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function createRepository(
  responses: readonly (MessagePage | Promise<MessagePage>)[],
) {
  let listener: ((change: DatabaseChange) => void) | undefined;
  let pageIndex = 0;
  const listMessagesPage = jest.fn<
    Promise<MessagePage>,
    [
      Readonly<{
        before: MessageCursor | null;
        conversationId: string;
        limit: number;
      }>,
    ]
  >(async () => await (responses[pageIndex++] ?? responses.at(-1)!));
  const subscribe = jest.fn(
    (nextListener: (change: DatabaseChange) => void) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    },
  );

  return {
    listMessagesPage,
    repository: { listMessagesPage, subscribe },
    publish(change: DatabaseChange) {
      listener?.(change);
    },
  };
}

describe("M5-UI-1 SQLite-only conversation controller", () => {
  test("exposes recoverable initial loading and retries the same newest-page query once", async () => {
    const useChatConversation = loadUseChatConversation();
    const firstPage = createDeferred<MessagePage>();
    const retryPage = createDeferred<MessagePage>();
    const fixture = createRepository([firstPage.promise, retryPage.promise]);
    let conversation: ChatConversation | undefined;

    function Probe(): React.JSX.Element {
      conversation = useChatConversation({
        conversationId: "fixture-conversation",
        repository: fixture.repository,
      });
      return (
        <Text>
          {conversation.initialPageStatus}:
          {conversation.items.map((item) => item.localId).join(",")}
        </Text>
      );
    }

    const screen = await render(<Probe />);
    expect(screen.getByText("loading:")).toBeTruthy();
    expect(fixture.listMessagesPage).toHaveBeenCalledWith({
      before: null,
      conversationId: "fixture-conversation",
      limit: expect.any(Number),
    });

    await act(async () => {
      firstPage.reject(new Error("initial page failed"));
      await firstPage.promise.catch(() => undefined);
    });
    expect(screen.getByText("error:")).toBeTruthy();

    let retry: Promise<void> | undefined;
    await act(async () => {
      retry = conversation!.retryInitialPage();
      await Promise.resolve();
    });
    expect(screen.getByText("loading:")).toBeTruthy();
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(2);
    expect(fixture.listMessagesPage).toHaveBeenLastCalledWith({
      before: null,
      conversationId: "fixture-conversation",
      limit: expect.any(Number),
    });

    await act(async () => {
      await conversation!.retryInitialPage();
    });
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      retryPage.resolve({ hasMore: false, items: [], nextBefore: null });
      await retry;
    });
    expect(screen.getByText("ready:")).toBeTruthy();
  });

  test("keeps existing rows ready when a subscription refresh rejects", async () => {
    const useChatConversation = loadUseChatConversation();
    const failedRefresh = createDeferred<MessagePage>();
    const fixture = createRepository([
      {
        hasMore: false,
        items: [message("existing", 100)],
        nextBefore: null,
      },
      failedRefresh.promise,
    ]);
    let conversation: ChatConversation | undefined;

    function Probe(): React.JSX.Element {
      conversation = useChatConversation({
        conversationId: "fixture-conversation",
        repository: fixture.repository,
      });
      return (
        <Text>
          {conversation.initialPageStatus}:
          {conversation.items.map((item) => item.localId).join(",")}
        </Text>
      );
    }

    const screen = await render(<Probe />);
    expect(await screen.findByText("ready:existing")).toBeTruthy();

    await act(async () => {
      fixture.publish({
        conversationId: "fixture-conversation",
        kind: "message-and-outbox-committed",
      });
      failedRefresh.reject(new Error("refresh failed"));
      await failedRefresh.promise.catch(() => undefined);
    });

    expect(screen.getByText("ready:existing")).toBeTruthy();
    expect(conversation!.items.map((item) => item.localId)).toEqual([
      "existing",
    ]);
  });

  test("refreshes only its conversation's newest page and retains already-prepended older rows", async () => {
    const useChatConversation = loadUseChatConversation();
    const fixture = createRepository([
      {
        hasMore: true,
        items: [message("anchor", 200), message("latest", 300)],
        nextBefore: { createdAtMs: 200, localId: "anchor" },
      },
      {
        hasMore: true,
        items: [message("older", 100)],
        nextBefore: { createdAtMs: 100, localId: "older" },
      },
      {
        hasMore: true,
        items: [message("anchor", 200), message("latest", 300)],
        nextBefore: { createdAtMs: 200, localId: "anchor" },
      },
      {
        hasMore: false,
        items: [],
        nextBefore: null,
      },
    ]);
    let conversation: ChatConversation | undefined;

    function Probe(): React.JSX.Element {
      conversation = useChatConversation({
        conversationId: "fixture-conversation",
        repository: fixture.repository,
      });
      return (
        <Text>{conversation.items.map((item) => item.localId).join(",")}</Text>
      );
    }

    const screen = await render(<Probe />);
    expect(await screen.findByText("anchor,latest")).toBeTruthy();
    expect(fixture.listMessagesPage).toHaveBeenCalledWith({
      before: null,
      conversationId: "fixture-conversation",
      limit: expect.any(Number),
    });

    await act(async () => {
      await conversation!.loadOlder();
    });
    expect(await screen.findByText("older,anchor,latest")).toBeTruthy();

    await act(async () => {
      fixture.publish({
        conversationId: "fixture-conversation",
        kind: "message-and-outbox-committed",
      });
      await Promise.resolve();
    });
    expect(await screen.findByText("older,anchor,latest")).toBeTruthy();
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(3);

    await act(async () => {
      await conversation!.loadOlder();
    });
    expect(fixture.listMessagesPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        before: { createdAtMs: 100, localId: "older" },
        conversationId: "fixture-conversation",
      }),
    );

    await act(async () => {
      fixture.publish({
        conversationId: "other-conversation",
        kind: "message-and-outbox-committed",
      });
    });
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(4);
  });

  test("exposes loading, ignores concurrent older calls, and stops once hasMore is false", async () => {
    const useChatConversation = loadUseChatConversation();
    const olderPage = createDeferred<MessagePage>();
    const fixture = createRepository([
      {
        hasMore: true,
        items: [message("anchor", 200), message("latest", 300)],
        nextBefore: { createdAtMs: 200, localId: "anchor" },
      },
      olderPage.promise,
    ]);
    let conversation: ChatConversation | undefined;

    function Probe(): React.JSX.Element {
      conversation = useChatConversation({
        conversationId: "fixture-conversation",
        repository: fixture.repository,
      });
      return (
        <Text>{conversation.items.map((item) => item.localId).join(",")}</Text>
      );
    }

    const screen = await render(<Probe />);
    expect(await screen.findByText("anchor,latest")).toBeTruthy();

    let firstLoad: Promise<void> | undefined;
    await act(async () => {
      firstLoad = conversation!.loadOlder();
      await Promise.resolve();
    });
    expect(conversation!.olderPageStatus).toBe("loading");
    await act(async () => {
      await conversation!.loadOlder();
    });
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      olderPage.resolve({
        hasMore: false,
        items: [message("older", 100)],
        nextBefore: null,
      });
      await firstLoad;
    });
    expect(await screen.findByText("older,anchor,latest")).toBeTruthy();
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      await conversation!.loadOlder();
    });
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(2);
    expect(conversation!.hasMore).toBe(false);
  });

  test("retains page rows and cursor on error, then retries the same loadOlder cursor", async () => {
    const useChatConversation = loadUseChatConversation();
    const failedPage = createDeferred<MessagePage>();
    const retryPage = createDeferred<MessagePage>();
    const fixture = createRepository([
      {
        hasMore: true,
        items: [message("anchor", 200), message("latest", 300)],
        nextBefore: { createdAtMs: 200, localId: "anchor" },
      },
      failedPage.promise,
      retryPage.promise,
    ]);
    let conversation: ChatConversation | undefined;

    function Probe(): React.JSX.Element {
      conversation = useChatConversation({
        conversationId: "fixture-conversation",
        repository: fixture.repository,
      });
      return (
        <Text>{conversation.items.map((item) => item.localId).join(",")}</Text>
      );
    }

    const screen = await render(<Probe />);
    expect(await screen.findByText("anchor,latest")).toBeTruthy();
    let failedLoad: Promise<void> | undefined;
    await act(async () => {
      failedLoad = conversation!.loadOlder();
      failedPage.reject(new Error("older page failed"));
      await failedLoad.catch(() => undefined);
    });
    expect(conversation!.olderPageStatus).toBe("error");
    expect(screen.getByText("anchor,latest")).toBeTruthy();
    expect(fixture.listMessagesPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        before: { createdAtMs: 200, localId: "anchor" },
        conversationId: "fixture-conversation",
      }),
    );

    let retry: Promise<void> | undefined;
    await act(async () => {
      retry = conversation!.loadOlder();
      await Promise.resolve();
    });
    expect(conversation!.olderPageStatus).toBe("loading");
    expect(fixture.listMessagesPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        before: { createdAtMs: 200, localId: "anchor" },
        conversationId: "fixture-conversation",
      }),
    );
    await act(async () => {
      retryPage.resolve({
        hasMore: false,
        items: [message("older", 100)],
        nextBefore: null,
      });
      await retry;
    });
    expect(await screen.findByText("older,anchor,latest")).toBeTruthy();
    expect(conversation!.olderPageStatus).toBe("idle");
  });

  test("coalesces same-conversation notifications received during the initial page request into exactly one follow-up refresh", async () => {
    const useChatConversation = loadUseChatConversation();
    const staleInitialPage = createDeferred<MessagePage>();
    const fixture = createRepository([
      staleInitialPage.promise,
      {
        hasMore: false,
        items: [
          message("committed-pending", 200, {
            clientMsgId: "local-committed-pending",
            status: "pending",
          }),
        ],
        nextBefore: null,
      },
    ]);
    let conversation: ChatConversation | undefined;

    function Probe(): React.JSX.Element {
      conversation = useChatConversation({
        conversationId: "fixture-conversation",
        repository: fixture.repository,
      });
      return (
        <Text>
          {conversation.initialPageStatus}:
          {conversation.items.map((item) => item.localId).join(",")}
        </Text>
      );
    }

    const screen = await render(<Probe />);
    expect(screen.getByText("loading:")).toBeTruthy();
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      fixture.publish({
        conversationId: "other-conversation",
        kind: "message-and-outbox-committed",
      });
      fixture.publish({
        conversationId: "fixture-conversation",
        kind: "message-and-outbox-committed",
      });
      fixture.publish({
        conversationId: "fixture-conversation",
        kind: "message-and-outbox-committed",
      });
      await Promise.resolve();
    });
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      staleInitialPage.resolve({ hasMore: false, items: [], nextBefore: null });
      await staleInitialPage.promise;
    });

    expect(await screen.findByText("ready:committed-pending")).toBeTruthy();
    const pendingRow = conversation!.items.find(
      (item) => item.localId === "committed-pending",
    );
    expect(pendingRow?.status).toBe("pending");
    expect(pendingRow?.clientMsgId).toBe("local-committed-pending");
    expect(fixture.listMessagesPage).toHaveBeenCalledTimes(2);
    expect(fixture.listMessagesPage).toHaveBeenLastCalledWith({
      before: null,
      conversationId: "fixture-conversation",
      limit: expect.any(Number),
    });
  });
});
