import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";
import { AccessibilityInfo, StatusBar, useColorScheme } from "react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => {
  const mockActual = jest.requireActual<
    typeof import("react-native-safe-area-context")
  >("react-native-safe-area-context");

  return {
    ...mockActual,
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  };
});

jest.mock("react-native-keyboard-controller", () => {
  const mockReact = jest.requireActual<typeof import("react")>("react");
  const mockCreateSharedValue = (initialValue: unknown) => {
    let currentValue = initialValue;

    return {
      get value() {
        return currentValue;
      },
      set value(nextValue: unknown) {
        currentValue = nextValue;
      },
      get: () => currentValue,
      set: (nextValue: unknown) => {
        currentValue =
          typeof nextValue === "function"
            ? (nextValue as (mockValue: unknown) => unknown)(currentValue)
            : nextValue;
      },
    };
  };

  return {
    KeyboardProvider: ({ children }: { children: unknown }) =>
      mockReact.createElement(mockReact.Fragment, null, children as never),
    KeyboardState: {
      UNKNOWN: 0,
      OPENING: 1,
      OPEN: 2,
      CLOSING: 3,
      CLOSED: 4,
    },
    useAnimatedKeyboard: () => ({
      height: mockCreateSharedValue(0),
      state: mockCreateSharedValue(0),
    }),
  };
});

jest.mock("react-native-reanimated", () => {
  const { FlatList, View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  const createSharedValue = (initialValue: unknown) => {
    let currentValue = initialValue;

    return {
      get value() {
        return currentValue;
      },
      set value(nextValue: unknown) {
        currentValue = nextValue;
      },
      get: () => currentValue,
      set: (nextValue: unknown) => {
        currentValue =
          typeof nextValue === "function"
            ? (nextValue as (mockValue: unknown) => unknown)(currentValue)
            : nextValue;
      },
    };
  };

  return {
    __esModule: true,
    default: { FlatList, View },
    scrollTo: jest.fn(),
    useAnimatedReaction: () => undefined,
    useAnimatedRef: () => ({ current: null }),
    useAnimatedStyle: (updater: () => unknown) => updater(),
    useDerivedValue: (updater: () => unknown) => createSharedValue(updater()),
    useSharedValue: createSharedValue,
  };
});

type FileSystemModule = Readonly<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>;

type DatabaseResource = Readonly<{
  close: () => Promise<void>;
  repository: Record<string, unknown>;
}>;
type AppProvidersProps = Readonly<{
  children: ReactNode;
  databaseFactory: () => Promise<DatabaseResource>;
  clockFactory: () => Readonly<{ nowMs: () => number }>;
  messageIdentityFactory: () => Readonly<{
    next: () => Readonly<{ clientMsgId: string; localId: string }>;
  }>;
}>;
type ChatScreenModule = { ChatScreen?: unknown };
type ChatMessageRowModule = { ChatMessageRow?: unknown };
type ChatMessageListModule = {
  ChatMessageList?: unknown;
  createChatMessageListScrollCoordinator?: unknown;
  getKeyboardAnchoredScrollOffset?: unknown;
};
type ThemeProviderModule = { AppThemeProvider?: unknown };
type ProvidersModule = { AppProviders?: unknown };
type ChatTokensModule = {
  appChatComposer?: unknown;
  appChatLayout?: unknown;
  appChatMessage?: unknown;
};
type M5ChatTokens = Readonly<{
  appChatComposer: Readonly<{
    borderRadius: 16;
    controlSize: 44;
    maxHeight: 120;
    minHeight: 48;
    pressFeedbackDurationMs: 150;
  }>;
  appChatLayout: Readonly<{
    compactBubbleMaxWidth: 0.78;
    conversationMaxWidth: 720;
    wideBubbleMaxWidth: 0.66;
  }>;
  appChatMessage: Readonly<{
    bubbleRadius: 20;
    directionalRadius: 8;
    fontSize: 16;
    groupGap: 12;
    lineHeight: 24.8;
    sameSenderGap: 4;
    timestampFontSize: 13;
  }>;
}>;
type ChatScreen = (
  props: Readonly<{
    focusMainHeading?: (target: unknown) => void;
  }>,
) => React.JSX.Element;
type ChatMessage = Readonly<{
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
type ChatConversation = Readonly<{
  hasMore: boolean;
  initialPageStatus: "error" | "loading" | "ready";
  items: ChatMessage[];
  loadOlder: () => Promise<void>;
  olderPageStatus: "error" | "idle" | "loading";
  retryInitialPage: () => Promise<void>;
}>;
type ChatMessageList = (
  props: Readonly<{
    conversation: ChatConversation;
    latestMessageRevealTarget: string | null;
    onRetryFailedMessage: (
      input: Readonly<{
        clientMsgId: string;
        conversationId: string;
      }>,
    ) => void;
  }>,
) => React.JSX.Element;
type ChatMessageListScrollCommand = Readonly<{
  animated: true;
  offset: number;
}>;
type ChatMessageListScrollCoordinator = Readonly<{
  setContentHeight: (height: number) => ChatMessageListScrollCommand | null;
  setRenderedMessageIds: (
    localIds: readonly string[],
  ) => ChatMessageListScrollCommand | null;
  setRevealTarget: (
    localId: string | null,
  ) => ChatMessageListScrollCommand | null;
  setScrollOffset: (offset: number) => void;
  setViewportHeight: (height: number) => ChatMessageListScrollCommand | null;
}>;
type GetKeyboardAnchoredScrollOffset = (
  input: Readonly<{
    contentHeight: number;
    keyboardOverlap: number;
    restingViewportHeight: number;
  }>,
) => number;
type ChatMessageRow = (
  props: Readonly<{
    message: ChatMessage;
    onRetryFailedMessage: (
      input: Readonly<{
        clientMsgId: string;
        conversationId: string;
      }>,
    ) => void;
  }>,
) => React.JSX.Element;

function createDeferred<Value>() {
  let reject: (error: Error) => void = () => undefined;
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

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

function loadChatScreenContract(): {
  AppProviders: ComponentType<AppProvidersProps>;
  ChatScreen: ChatScreen;
} {
  let chat: ChatScreenModule;
  let providers: ProvidersModule;
  try {
    chat = jest.requireActual<ChatScreenModule>(
      "../../../src/features/chat/ui/chat-screen",
    );
    providers = jest.requireActual<ProvidersModule>(
      "../../../src/core/providers/app-providers",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M5-UI-1 implementation missing: ChatScreen and AppProviders runtime composition must exist before accessibility GREEN.",
      );
    }
    throw error;
  }

  if (typeof chat.ChatScreen !== "function") {
    throw new Error(
      "M5-UI-1 chat accessibility contract is incomplete: chat-screen.tsx must export ChatScreen.",
    );
  }
  if (typeof providers.AppProviders !== "function") {
    throw new Error(
      "M5-UI-1 chat accessibility contract is incomplete: app-providers.tsx must export AppProviders.",
    );
  }
  return {
    AppProviders: providers.AppProviders as ComponentType<AppProvidersProps>,
    ChatScreen: chat.ChatScreen as ChatScreen,
  };
}

function loadChatMessageRowContract(): {
  AppThemeProvider: ComponentType<{ children: ReactNode }>;
  ChatMessageRow: ChatMessageRow;
} {
  let row: ChatMessageRowModule;
  let theme: ThemeProviderModule;
  try {
    row = jest.requireActual<ChatMessageRowModule>(
      "../../../src/features/chat/ui/chat-message-row",
    );
    theme = jest.requireActual<ThemeProviderModule>(
      "../../../src/core/theme/theme-provider",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M5-UI-1 implementation missing: chat-message-row.tsx must export ChatMessageRow before status-live behavior can be verified.",
      );
    }
    throw error;
  }
  if (typeof row.ChatMessageRow !== "function") {
    throw new Error(
      "M5-UI-1 chat-row contract is incomplete: expected ChatMessageRow({ message, onRetryFailedMessage }).",
    );
  }
  if (typeof theme.AppThemeProvider !== "function") {
    throw new Error(
      "M5-UI-1 chat-row contract is incomplete: expected AppThemeProvider for semantic-role rendering.",
    );
  }
  return {
    AppThemeProvider: theme.AppThemeProvider as ComponentType<{
      children: ReactNode;
    }>,
    ChatMessageRow: row.ChatMessageRow as ChatMessageRow,
  };
}

function loadChatMessageListContract(): {
  AppThemeProvider: ComponentType<{ children: ReactNode }>;
  ChatMessageList: ChatMessageList;
  createChatMessageListScrollCoordinator: () => ChatMessageListScrollCoordinator;
} {
  let list: ChatMessageListModule;
  let theme: ThemeProviderModule;
  try {
    list = jest.requireActual<ChatMessageListModule>(
      "../../../src/features/chat/ui/chat-message-list",
    );
    theme = jest.requireActual<ThemeProviderModule>(
      "../../../src/core/theme/theme-provider",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M5-UI-1 implementation missing: chat-message-list.tsx must export ChatMessageList before local-send visibility can be verified.",
      );
    }
    throw error;
  }
  if (typeof list.ChatMessageList !== "function") {
    throw new Error(
      "M5-UI-1 chat-list contract is incomplete: expected ChatMessageList({ conversation, latestMessageRevealTarget, onRetryFailedMessage }).",
    );
  }
  if (typeof theme.AppThemeProvider !== "function") {
    throw new Error(
      "M5-UI-1 chat-list contract is incomplete: expected AppThemeProvider for list rendering.",
    );
  }
  if (typeof list.createChatMessageListScrollCoordinator !== "function") {
    throw new Error(
      "M5-UI-1 chat-list scroll contract is incomplete: expected createChatMessageListScrollCoordinator().",
    );
  }
  return {
    AppThemeProvider: theme.AppThemeProvider as ComponentType<{
      children: ReactNode;
    }>,
    ChatMessageList: list.ChatMessageList as ChatMessageList,
    createChatMessageListScrollCoordinator:
      list.createChatMessageListScrollCoordinator as () => ChatMessageListScrollCoordinator,
  };
}

function loadKeyboardAnchoredScrollOffset(): GetKeyboardAnchoredScrollOffset {
  let list: ChatMessageListModule;
  try {
    list = jest.requireActual<ChatMessageListModule>(
      "../../../src/features/chat/ui/chat-message-list",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M5-UI-1 implementation missing: chat-message-list.tsx must exist before keyboard anchoring can be verified.",
      );
    }
    throw error;
  }

  if (typeof list.getKeyboardAnchoredScrollOffset !== "function") {
    throw new Error(
      "M5-UI-1 keyboard anchoring contract is incomplete: expected getKeyboardAnchoredScrollOffset().",
    );
  }

  return list.getKeyboardAnchoredScrollOffset as GetKeyboardAnchoredScrollOffset;
}

function loadM5ChatTokens(): M5ChatTokens {
  const tokens = jest.requireActual<ChatTokensModule>(
    "../../../src/core/theme/tokens",
  );
  if (
    !isRecord(tokens.appChatLayout) ||
    !isRecord(tokens.appChatMessage) ||
    !isRecord(tokens.appChatComposer)
  ) {
    throw new Error(
      "M5-UI-1 token contract is incomplete: tokens.ts must export appChatLayout, appChatMessage, and appChatComposer.",
    );
  }
  return tokens as M5ChatTokens;
}

function createRepository(): Record<string, unknown> {
  const messages = [
    {
      body: "pending body",
      clientMsgId: "pending-client",
      conversationId: "fixture-conversation",
      createdAtMs: 100,
      eventId: null,
      localId: "pending-local",
      senderId: "local-user",
      serverSequence: null,
      status: "pending",
    },
    {
      body: "failed body",
      clientMsgId: "failed-client",
      conversationId: "fixture-conversation",
      createdAtMs: 110,
      eventId: null,
      localId: "failed-local",
      senderId: "local-user",
      serverSequence: null,
      status: "failed",
    },
    {
      body: "sent body",
      clientMsgId: null,
      conversationId: "fixture-conversation",
      createdAtMs: 120,
      eventId: "event-sent",
      localId: "sent-local",
      senderId: "fixture-sender",
      serverSequence: 1,
      status: "sent",
    },
  ];
  return {
    ensureFixtureConversation: jest.fn(async () => undefined),
    enqueuePendingMessage: jest.fn(async () => messages[0]),
    listMessagesPage: jest.fn(async () => ({
      hasMore: false,
      items: messages,
      nextBefore: null,
    })),
    retryFailedMessage: jest.fn(async () => messages[0]),
    subscribe: jest.fn(() => () => undefined),
  };
}

const mockedUseColorScheme = jest.mocked(useColorScheme);

describe("M5-UI-1 accessible local chat screen", () => {
  test("distinguishes initial message loading, recoverable error, and successful empty state", async () => {
    const { AppProviders, ChatScreen } = loadChatScreenContract();
    const firstPage = createDeferred<{
      hasMore: false;
      items: [];
      nextBefore: null;
    }>();
    const retryPage = createDeferred<{
      hasMore: false;
      items: [];
      nextBefore: null;
    }>();
    const listMessagesPage = jest
      .fn()
      .mockImplementationOnce(async () => await firstPage.promise)
      .mockImplementationOnce(async () => await retryPage.promise);
    const repository = { ...createRepository(), listMessagesPage };
    const screen = await render(
      <AppProviders
        clockFactory={() => ({ nowMs: () => 1000 })}
        databaseFactory={async () => ({
          close: async () => undefined,
          repository,
        })}
        messageIdentityFactory={() => ({
          next: () => ({ clientMsgId: "next-client", localId: "next-local" }),
        })}
      >
        <ChatScreen focusMainHeading={() => undefined} />
      </AppProviders>,
    );

    expect(await screen.findByText("메시지 불러오는 중...")).toBeTruthy();
    await act(async () => {
      firstPage.reject(new Error("initial page failed"));
      await firstPage.promise.catch(() => undefined);
    });

    expect(
      await screen.findByText("메시지를 불러오지 못했습니다."),
    ).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    const retry = screen.getByRole("button", {
      name: "메시지 다시 불러오기",
    });

    await fireEvent.press(retry);
    expect(screen.getByText("메시지 불러오는 중...")).toBeTruthy();
    expect(listMessagesPage).toHaveBeenCalledTimes(2);
    expect(listMessagesPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        before: null,
        conversationId: "fixture-conversation",
      }),
    );

    await fireEvent.press(retry);
    expect(listMessagesPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      retryPage.resolve({ hasMore: false, items: [], nextBefore: null });
      await retryPage.promise;
    });
    expect(await screen.findByText("아직 메시지가 없습니다.")).toBeTruthy();
    expect(screen.queryByText("메시지를 불러오지 못했습니다.")).toBeNull();
  });

  test("orders heading, local notice, messages, composer, and send action with exact Korean semantics", async () => {
    const { AppProviders, ChatScreen } = loadChatScreenContract();
    const focusMainHeading = jest.fn();
    const repository = createRepository();
    const screen = await render(
      <AppProviders
        clockFactory={() => ({ nowMs: () => 1000 })}
        databaseFactory={async () => ({
          close: async () => undefined,
          repository,
        })}
        messageIdentityFactory={() => ({
          next: () => ({ clientMsgId: "next-client", localId: "next-local" }),
        })}
      >
        <ChatScreen focusMainHeading={focusMainHeading} />
      </AppProviders>,
    );

    expect(
      await screen.findByRole("header", { name: "로컬 대화" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "로컬 개발용 fixture 데이터입니다. production server에 연결되어 있지 않습니다.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("채팅 메시지")).toBeTruthy();
    expect(screen.getByLabelText("메시지 입력")).toBeTruthy();
    expect(screen.getByRole("button", { name: "메시지 보내기" })).toBeTruthy();
    expect(focusMainHeading).toHaveBeenCalledTimes(1);
    const focusTarget = focusMainHeading.mock.calls[0]?.[0];
    expect(isRecord(focusTarget)).toBe(true);
    expect(isRecord(focusTarget?.props)).toBe(true);
    expect(focusTarget?.props).toEqual(
      expect.objectContaining({
        accessibilityRole: "header",
        children: "로컬 대화",
      }),
    );

    const renderedTree = JSON.stringify(screen.toJSON());
    const headingIndex = renderedTree.indexOf("로컬 대화");
    const noticeIndex = renderedTree.indexOf(
      "로컬 개발용 fixture 데이터입니다. production server에 연결되어 있지 않습니다.",
    );
    const messagesIndex = renderedTree.indexOf("pending body");
    const composerIndex = renderedTree.indexOf("메시지 입력");
    const sendIndex = renderedTree.indexOf("메시지 보내기");
    expect(headingIndex).toBeGreaterThanOrEqual(0);
    expect(headingIndex).toBeLessThan(noticeIndex);
    expect(noticeIndex).toBeLessThan(messagesIndex);
    expect(messagesIndex).toBeLessThan(composerIndex);
    expect(composerIndex).toBeLessThan(sendIndex);

    expect(screen.getByText("전송 중")).toBeTruthy();
    expect(screen.getByText("전송 실패")).toBeTruthy();
    expect(screen.getByText("전송됨")).toBeTruthy();
  });

  test.each([
    { colorScheme: "light" as const, expectedBarStyle: "dark-content" },
    { colorScheme: "dark" as const, expectedBarStyle: "light-content" },
  ])(
    "uses $expectedBarStyle system-bar content for the $colorScheme app theme",
    async ({ colorScheme, expectedBarStyle }) => {
      mockedUseColorScheme.mockReturnValue(colorScheme);
      const pushStatusBarEntry = jest.spyOn(StatusBar, "pushStackEntry");

      try {
        const { AppProviders, ChatScreen } = loadChatScreenContract();
        const repository = createRepository();
        const screen = await render(
          <AppProviders
            clockFactory={() => ({ nowMs: () => 1000 })}
            databaseFactory={async () => ({
              close: async () => undefined,
              repository,
            })}
            messageIdentityFactory={() => ({
              next: () => ({
                clientMsgId: "next-client",
                localId: "next-local",
              }),
            })}
          >
            <ChatScreen focusMainHeading={() => undefined} />
          </AppProviders>,
        );

        expect(
          await screen.findByRole("header", { name: "로컬 대화" }),
        ).toBeTruthy();
        expect(pushStatusBarEntry).toHaveBeenCalledWith(
          expect.objectContaining({ barStyle: expectedBarStyle }),
        );
      } finally {
        pushStatusBarEntry.mockRestore();
        mockedUseColorScheme.mockReset();
      }
    },
  );

  test("uses separately named failed-message retry and never introduces M6 connection copy", async () => {
    const { AppProviders, ChatScreen } = loadChatScreenContract();
    const repository = createRepository();
    const screen = await render(
      <AppProviders
        clockFactory={() => ({ nowMs: () => 1000 })}
        databaseFactory={async () => ({
          close: async () => undefined,
          repository,
        })}
        messageIdentityFactory={() => ({
          next: () => ({ clientMsgId: "next-client", localId: "next-local" }),
        })}
      >
        <ChatScreen />
      </AppProviders>,
    );

    const retry = await screen.findByRole("button", {
      name: "메시지 다시 보내기",
    });
    await fireEvent.press(retry);

    expect(repository.retryFailedMessage).toHaveBeenCalledWith({
      clientMsgId: "failed-client",
      conversationId: "fixture-conversation",
    });
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(
      screen.queryByText(/연결됨|연결이 끊겼어요|다시 연결하는 중/),
    ).toBeNull();
  });

  test("keeps list anchoring, pagination recovery, status-announcement dedupe, semantic roles, tokens, and platform keyboard adaptation in the shared UI boundary", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const screenSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-screen.tsx`,
      "utf8",
    );
    const listSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-message-list.tsx`,
      "utf8",
    );
    const rowSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-message-row.tsx`,
      "utf8",
    );
    const tokens = loadM5ChatTokens();

    expect(screenSource).toMatch(/focusMainHeading\s*\(\s*[^)]*heading[^)]*\)/);
    expect(screenSource).toMatch(/SafeAreaView|useSafeAreaInsets/);
    expect(listSource).toMatch(/FlatList/);
    expect(listSource).toMatch(/keyExtractor\s*=\s*\{[^\n]*localId[^\n]*\}/);
    expect(listSource).toMatch(/maintainVisibleContentPosition/);
    expect(listSource).toMatch(/onStartReached/);
    expect(listSource).toMatch(
      /const loadOlderFromTopEdge = \(\) => \{\s*if \(\s*conversation\.olderPageStatus === "idle" && conversation\.hasMore\s*\) \{\s*void conversation\.loadOlder\(\);\s*\}\s*\};/,
    );
    expect(listSource).toMatch(
      /const retryOlderPage = \(\) => \{\s*if \(\s*conversation\.olderPageStatus === "error" && conversation\.hasMore\s*\) \{\s*void conversation\.loadOlder\(\);\s*\}\s*\};/,
    );
    expect(listSource).toMatch(/onPress=\{retryOlderPage\}/);
    expect(listSource).not.toMatch(/inverted\s*=\s*\{?true\}?/);
    expect(listSource).toMatch(/이전 메시지 불러오는 중\.\.\./);
    expect(listSource).toMatch(/이전 메시지 다시 불러오기/);
    expect(rowSource).toMatch(/전송 중/);
    expect(rowSource).toMatch(/전송 실패/);
    expect(rowSource).toMatch(/전송됨/);
    expect(rowSource).toMatch(/메시지 다시 보내기/);
    expect(rowSource).toMatch(/AccessibilityInfo\.announceForAccessibility/);
    expect(rowSource).toMatch(/useRef|previous.*status|status.*previous/i);
    expect(rowSource).toMatch(/colors\.primary|primary/);
    expect(rowSource).toMatch(/colors\.surface|surface/);
    expect(`${screenSource}\n${listSource}\n${rowSource}`).not.toMatch(
      /연결됨|연결이 끊겼어요|다시 연결하는 중|다시 시도/,
    );
    expect(tokens.appChatLayout).toEqual({
      compactBubbleMaxWidth: 0.78,
      conversationMaxWidth: 720,
      wideBubbleMaxWidth: 0.66,
    });
    expect(tokens.appChatMessage).toEqual({
      bubbleRadius: 20,
      directionalRadius: 8,
      fontSize: 16,
      groupGap: 12,
      lineHeight: 24.8,
      sameSenderGap: 4,
      timestampFontSize: 13,
    });
    expect(tokens.appChatComposer).toEqual({
      borderRadius: 16,
      controlSize: 44,
      maxHeight: 120,
      minHeight: 48,
      pressFeedbackDurationMs: 150,
    });
    expect(listSource).toMatch(/appChatLayout|appChatMessage/);
    expect(rowSource).toMatch(/appChatLayout|appChatMessage/);
    expect(
      filesystem.readFileSync(
        `${process.cwd()}/src/features/chat/ui/chat-composer.tsx`,
        "utf8",
      ),
    ).toMatch(/appChatComposer/);
  });

  test("does not issue stepped JS scrolls for keyboard-driven viewport changes", () => {
    const { createChatMessageListScrollCoordinator } =
      loadChatMessageListContract();
    const coordinator = createChatMessageListScrollCoordinator();

    expect(coordinator.setViewportHeight(600)).toBeNull();
    expect(coordinator.setRenderedMessageIds(["existing-message"])).toBeNull();
    expect(coordinator.setContentHeight(1_000)).toBeNull();

    coordinator.setScrollOffset(250);

    expect(coordinator.setViewportHeight(300)).toBeNull();
    expect(coordinator.setViewportHeight(600)).toBeNull();
  });

  test("anchors the latest message continuously to native keyboard progress", () => {
    const getKeyboardAnchoredScrollOffset = loadKeyboardAnchoredScrollOffset();

    expect(
      getKeyboardAnchoredScrollOffset({
        contentHeight: 1_000,
        keyboardOverlap: 0,
        restingViewportHeight: 600,
      }),
    ).toBe(400);
    expect(
      getKeyboardAnchoredScrollOffset({
        contentHeight: 1_000,
        keyboardOverlap: 137.5,
        restingViewportHeight: 600,
      }),
    ).toBe(537.5);
    expect(
      getKeyboardAnchoredScrollOffset({
        contentHeight: 1_000,
        keyboardOverlap: 300,
        restingViewportHeight: 600,
      }),
    ).toBe(700);
    expect(
      getKeyboardAnchoredScrollOffset({
        contentHeight: 200,
        keyboardOverlap: 300,
        restingViewportHeight: 600,
      }),
    ).toBe(0);
  });

  test("reveals only a committed local target after native content layout settles", () => {
    const { createChatMessageListScrollCoordinator } =
      loadChatMessageListContract();
    const coordinator = createChatMessageListScrollCoordinator();

    expect(coordinator.setViewportHeight(300)).toBeNull();
    expect(coordinator.setRenderedMessageIds(["existing-message"])).toBeNull();
    expect(coordinator.setContentHeight(600)).toBeNull();

    expect(
      coordinator.setRenderedMessageIds([
        "existing-message",
        "incoming-message",
      ]),
    ).toBeNull();
    expect(coordinator.setContentHeight(680)).toBeNull();
    expect(coordinator.setRevealTarget("local-message")).toBeNull();

    expect(
      coordinator.setRenderedMessageIds([
        "existing-message",
        "incoming-message",
        "local-message",
      ]),
    ).toBeNull();
    expect(coordinator.setContentHeight(760)).toEqual({
      animated: true,
      offset: 460,
    });

    expect(
      coordinator.setRenderedMessageIds([
        "existing-message",
        "incoming-message",
        "local-message",
        "later-incoming-message",
      ]),
    ).toBeNull();
    expect(coordinator.setContentHeight(840)).toBeNull();

    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const screenSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-screen.tsx`,
      "utf8",
    );
    const listSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-message-list.tsx`,
      "utf8",
    );
    expect(screenSource).toMatch(/onMessageCommitted/);
    expect(screenSource).toMatch(/latestMessageRevealTarget/);
    expect(listSource).toMatch(/onContentSizeChange\s*=/);
    expect(listSource).toMatch(/onLayout\s*=/);
    expect(listSource).toMatch(/scrollToOffset/);
    expect(listSource).not.toMatch(/scrollToEnd/);
  });

  test("uses settled metrics when the committed target arrives after its row", () => {
    const { createChatMessageListScrollCoordinator } =
      loadChatMessageListContract();
    const coordinator = createChatMessageListScrollCoordinator();

    expect(coordinator.setViewportHeight(300)).toBeNull();
    expect(
      coordinator.setRenderedMessageIds(["existing-message", "local-message"]),
    ).toBeNull();
    expect(coordinator.setContentHeight(760)).toBeNull();

    expect(coordinator.setRevealTarget("local-message")).toEqual({
      animated: true,
      offset: 460,
    });
  });

  test("drives both platform frames and list anchoring from native keyboard progress", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const screenSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-screen.tsx`,
      "utf8",
    );
    const iosSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-keyboard-frame.ios.tsx`,
      "utf8",
    );
    const androidSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-keyboard-frame.android.tsx`,
      "utf8",
    );
    const listSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-message-list.tsx`,
      "utf8",
    );

    const frameStart = screenSource.indexOf("<ChatKeyboardFrame>");
    const messageList = screenSource.indexOf("<ChatMessageList");
    const composer = screenSource.indexOf("<ChatComposer");
    const frameEnd = screenSource.indexOf("</ChatKeyboardFrame>");

    expect(frameStart).toBeGreaterThan(-1);
    expect(frameStart).toBeLessThan(messageList);
    expect(messageList).toBeLessThan(composer);
    expect(composer).toBeLessThan(frameEnd);
    expect(screenSource).toMatch(/keyboardOverlap/);
    expect(screenSource).toMatch(/keyboardState/);
    expect(screenSource).toMatch(/keyboardOverlap=\{keyboardOverlap\}/);
    expect(screenSource).toMatch(/keyboardState=\{keyboardState\}/);

    for (const platformSource of [iosSource, androidSource]) {
      expect(platformSource).toMatch(/useAnimatedKeyboard/);
      expect(platformSource).toMatch(/useAnimatedStyle/);
      expect(platformSource).toMatch(/keyboardOverlap/);
      expect(platformSource).toMatch(/paddingBottom/);
      expect(platformSource).not.toMatch(/KeyboardAvoidingView/);
    }

    expect(listSource).toMatch(/useAnimatedReaction/);
    expect(listSource).toMatch(/useAnimatedRef/);
    expect(listSource).toMatch(/scrollTo\s*\(/);
    expect(listSource).toMatch(/getKeyboardAnchoredScrollOffset/);
    expect(listSource).not.toMatch(/setTimeout|requestAnimationFrame/);
  });

  test("sources both platform keyboard frames from the mounted native controller", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const platformSources = [
      filesystem.readFileSync(
        `${process.cwd()}/src/features/chat/ui/chat-keyboard-frame.ios.tsx`,
        "utf8",
      ),
      filesystem.readFileSync(
        `${process.cwd()}/src/features/chat/ui/chat-keyboard-frame.android.tsx`,
        "utf8",
      ),
    ];

    for (const platformSource of platformSources) {
      expect(platformSource).toMatch(
        /import\s*\{[^}]*KeyboardState[^}]*useAnimatedKeyboard[^}]*\}\s*from\s*["']react-native-keyboard-controller["']/,
      );
      expect(platformSource).not.toMatch(
        /import[^;]*useAnimatedKeyboard[^;]*from\s*["']react-native-reanimated["']/,
      );
    }
  });

  test("does not repeat a live announcement for the same state but exposes one after a status transition", async () => {
    const { AppThemeProvider, ChatMessageRow } = loadChatMessageRowContract();
    const announceForAccessibility = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    const pendingMessage = {
      body: "live body",
      clientMsgId: "live-client",
      conversationId: "fixture-conversation",
      createdAtMs: 100,
      eventId: null,
      localId: "live-local",
      senderId: "local-user",
      serverSequence: null,
      status: "pending" as const,
    };
    const retry = jest.fn();
    try {
      const screen = await render(
        <AppThemeProvider>
          <ChatMessageRow
            message={pendingMessage}
            onRetryFailedMessage={retry}
          />
        </AppThemeProvider>,
      );

      expect(announceForAccessibility).not.toHaveBeenCalled();
      await screen.rerender(
        <AppThemeProvider>
          <ChatMessageRow
            message={pendingMessage}
            onRetryFailedMessage={retry}
          />
        </AppThemeProvider>,
      );
      expect(announceForAccessibility).not.toHaveBeenCalled();

      await screen.rerender(
        <AppThemeProvider>
          <ChatMessageRow
            message={{ ...pendingMessage, status: "sent" }}
            onRetryFailedMessage={retry}
          />
        </AppThemeProvider>,
      );
      expect(announceForAccessibility).toHaveBeenCalledTimes(1);
      expect(announceForAccessibility).toHaveBeenLastCalledWith("전송됨");

      await screen.rerender(
        <AppThemeProvider>
          <ChatMessageRow
            message={{ ...pendingMessage, status: "sent" }}
            onRetryFailedMessage={retry}
          />
        </AppThemeProvider>,
      );
      expect(announceForAccessibility).toHaveBeenCalledTimes(1);
    } finally {
      announceForAccessibility.mockRestore();
    }
  });
});
