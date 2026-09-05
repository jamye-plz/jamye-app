import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";

let mockRouterShouldThrow = false;
const mockShellRepository = {
  ensureFixtureConversation: jest.fn(async () => undefined),
};
const mockShellDatabaseClose = jest.fn(async () => undefined);
const mockProductionDatabaseFactory = jest.fn(async () => ({
  close: mockShellDatabaseClose,
  repository: mockShellRepository,
}));

jest.mock("../../src/core/database/database-provider", () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    "../../src/core/database/database-provider",
  );

  return {
    ...actual,
    productionDatabaseFactory: mockProductionDatabaseFactory,
  };
});

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
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

jest.mock("expo-router", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  function Stack(): React.JSX.Element {
    if (mockRouterShouldThrow) {
      throw new Error("router-render-failure");
    }
    const theme = jest.requireActual<{
      useAppTheme: () => { colorScheme: "light" | "dark" };
    }>("../../src/core/theme/theme-provider");
    const { colorScheme } = theme.useAppTheme();

    return (
      <View
        accessibilityLabel={`Expo Router stack ${colorScheme}`}
        testID="expo-router-stack"
      />
    );
  }

  return { Stack };
});

type DefaultComponentModule = { default?: unknown };
type NamedComponentModule = Record<string, unknown>;
type AppProvidersProps = {
  children: ReactNode;
  clockFactory?: () => Readonly<{ nowMs: () => number }>;
  databaseFactory?: () => Promise<
    Readonly<{
      close: () => Promise<void>;
      repository: Record<string, unknown>;
    }>
  >;
  messageIdentityFactory?: () => Readonly<{
    next: () => Readonly<{ clientMsgId: string; localId: string }>;
  }>;
};

const REQUIRED_NOTICE =
  "로컬 개발용 fixture 데이터입니다. production server에 연결되어 있지 않습니다.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error.code === "MODULE_NOT_FOUND" ||
    (typeof error.message === "string" &&
      error.message.includes("Cannot find module"))
  );
}

function loadRequiredModule<T extends object>(
  modulePath: string,
  implementationPath: string,
): T {
  try {
    return jest.requireActual<T>(modulePath);
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        `M3-I3 implementation missing: ${implementationPath} must exist before GREEN.`,
      );
    }
    throw error;
  }
}

function requireShellDependencies(): void {
  const dependencies = [
    [
      "../../src/core/errors/app-error-boundary",
      "src/core/errors/app-error-boundary.tsx",
      "AppErrorBoundary",
    ],
    [
      "../../src/core/providers/app-providers",
      "src/core/providers/app-providers.tsx",
      "AppProviders",
    ],
    [
      "../../src/core/theme/theme-provider",
      "src/core/theme/theme-provider.tsx",
      "useAppTheme",
    ],
  ] as const;

  for (const [modulePath, implementationPath, exportName] of dependencies) {
    const loaded = loadRequiredModule<NamedComponentModule>(
      modulePath,
      implementationPath,
    );
    if (typeof loaded[exportName] !== "function") {
      throw new Error(
        `M3-I3 implementation incomplete: ${implementationPath} must export ${exportName}.`,
      );
    }
  }
}

function loadActualRoute(
  modulePath: string,
  implementationPath: string,
): ComponentType {
  requireShellDependencies();
  const loaded = loadRequiredModule<DefaultComponentModule>(
    modulePath,
    implementationPath,
  );
  if (typeof loaded.default !== "function") {
    throw new Error(
      `M3-I3 implementation incomplete: ${implementationPath} must default-export its actual route component.`,
    );
  }
  return loaded.default as ComponentType;
}

function loadActualAppProviders(): ComponentType<AppProvidersProps> {
  const loaded = loadRequiredModule<NamedComponentModule>(
    "../../src/core/providers/app-providers",
    "src/core/providers/app-providers.tsx",
  );
  if (typeof loaded.AppProviders !== "function") {
    throw new Error(
      "M3-I3 implementation incomplete: app-providers.tsx must export AppProviders.",
    );
  }
  return loaded.AppProviders as ComponentType<AppProvidersProps>;
}

let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  mockRouterShouldThrow = false;
  mockProductionDatabaseFactory.mockClear();
  mockShellDatabaseClose.mockClear();
  mockShellRepository.ensureFixtureConversation.mockClear();
  consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("M3-I3 actual thin Expo Router modules", () => {
  test("renders the actual root layout with the active theme provider around Expo Router", async () => {
    const RootLayout = loadActualRoute(
      "../../src/app/_layout",
      "src/app/_layout.tsx",
    );
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("expo-router-stack")).toBeTruthy();
    expect(screen.getByLabelText("Expo Router stack light")).toBeTruthy();
  });

  test("keeps the actual root Error Boundary outside the Router and recovers on retry", async () => {
    const RootLayout = loadActualRoute(
      "../../src/app/_layout",
      "src/app/_layout.tsx",
    );
    mockRouterShouldThrow = true;
    const screen = await render(<RootLayout />);

    expect(screen.getByRole("alert")).toBeTruthy();

    mockRouterShouldThrow = false;
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.getByLabelText("Expo Router stack light")).toBeTruthy();
  });

  test("binds the actual index route to one fixture selector and the exact local fixture notice", async () => {
    const chat = loadRequiredModule<NamedComponentModule>(
      "../../src/features/chat/ui/chat-screen",
      "src/features/chat/ui/chat-screen.tsx",
    );
    const fixture = loadRequiredModule<NamedComponentModule>(
      "../../src/features/chat/model/chat-fixture",
      "src/features/chat/model/chat-fixture.ts",
    );
    if (typeof chat.ChatScreen !== "function") {
      throw new Error(
        "M5-UI-1 implementation incomplete: chat-screen.tsx must export ChatScreen.",
      );
    }
    if (fixture.LOCAL_FIXTURE_NOTICE !== REQUIRED_NOTICE) {
      throw new Error(
        "M5-UI-1 fixture contract is incomplete: LOCAL_FIXTURE_NOTICE must preserve the exact local-only copy.",
      );
    }
    if (
      !isRecord(fixture.FIXTURE_CONVERSATION_SEED) ||
      !isRecord(fixture.FIXTURE_CONVERSATION_SEED.conversation) ||
      fixture.FIXTURE_CONVERSATION_SEED.conversation.id !==
        fixture.FIXTURE_CONVERSATION_ID
    ) {
      throw new Error(
        "M5-UI-1 fixture contract is incomplete: seed conversation.id must equal FIXTURE_CONVERSATION_ID.",
      );
    }
    if (typeof fixture.FIXTURE_CONVERSATION_ID !== "string") {
      throw new Error(
        "M5-UI-1 fixture contract is incomplete: FIXTURE_CONVERSATION_ID must be a string selector.",
      );
    }
    const fixtureConversationId = fixture.FIXTURE_CONVERSATION_ID;

    const IndexRoute = loadActualRoute(
      "../../src/app/index",
      "src/app/index.tsx",
    );
    const AppProviders = loadActualAppProviders();
    const repository = {
      ensureFixtureConversation: jest.fn(async () => undefined),
      enqueuePendingMessage: jest.fn(async (input) => ({
        ...input,
        eventId: null,
        serverSequence: null,
        status: "pending",
      })),
      listMessagesPage: jest.fn(async () => ({
        hasMore: false,
        items: [],
        nextBefore: null,
      })),
      retryFailedMessage: jest.fn(async () => undefined),
      subscribe: jest.fn(() => () => undefined),
    };
    const screen = await render(
      <AppProviders
        clockFactory={() => ({ nowMs: () => 1000 })}
        databaseFactory={async () => ({
          close: async () => undefined,
          repository,
        })}
        messageIdentityFactory={() => ({
          next: () => ({ clientMsgId: "test-client", localId: "test-local" }),
        })}
      >
        <IndexRoute />
      </AppProviders>,
    );

    expect(await screen.findByText(REQUIRED_NOTICE)).toBeTruthy();
    expect(screen.getByRole("header", { name: "로컬 대화" })).toBeTruthy();
    expect(repository.listMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        before: null,
        conversationId: fixtureConversationId,
      }),
    );

    await fireEvent.changeText(
      screen.getByLabelText("메시지 입력"),
      "fixture selector send",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "메시지 보내기" }),
    );
    expect(repository.enqueuePendingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "fixture selector send",
        conversationId: fixtureConversationId,
      }),
    );
  });
});
