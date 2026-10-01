import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";

// Keep native image gestures outside thin route/provider wiring tests.
jest.mock("@/features/media/ui/media-image-viewer", () => ({
  MediaImageViewer: () => null,
}));
// W2: `chat-composer.ios.tsx` renders a native SwiftUI `TextField` by
// default (`COMPOSER_TEXT_FIELD_IMPL === "native"`). See the matching mock in
// `chat-composer.test.tsx` for why this stand-in is needed (jest-expo renders
// `@expo/ui`'s components as an opaque host node).
jest.mock("@expo/ui/swift-ui", () => {
  const actual =
    jest.requireActual<Record<string, unknown>>("@expo/ui/swift-ui");
  const mockReact = jest.requireActual<typeof import("react")>("react");
  const { TextInput } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function extractLabel(modifiers?: readonly unknown[]): string | undefined {
    const found = modifiers?.find(
      (modifier): modifier is { $type: string; value: string } =>
        typeof modifier === "object" &&
        modifier !== null &&
        (modifier as { $type?: unknown }).$type === "accessibilityLabel",
    );
    return found?.value;
  }
  const TextField = mockReact.forwardRef(function MockSwiftUITextField(
    props: {
      axis?: string;
      modifiers?: readonly unknown[];
      onFocusChange?: (focused: boolean) => void;
      onTextChange?: (text: string) => void;
      placeholder?: string;
    },
    ref: React.Ref<{ clear: () => void }>,
  ) {
    const [text, setText] = mockReact.useState("");
    mockReact.useImperativeHandle(ref, () => ({
      clear: () => setText(""),
      focus: () => undefined,
    }));
    return (
      <TextInput
        accessibilityLabel={extractLabel(props.modifiers)}
        multiline={props.axis === "vertical"}
        onBlur={() => props.onFocusChange?.(false)}
        onChangeText={(next: string) => {
          setText(next);
          props.onTextChange?.(next);
        }}
        onFocus={() => props.onFocusChange?.(true)}
        placeholder={props.placeholder}
        value={text}
      />
    );
  });
  return { ...actual, TextField };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  accessibilityLabel: (value: string) => ({
    $type: "accessibilityLabel",
    value,
  }),
  lineLimit: (range: unknown) => ({ $type: "lineLimit", range }),
}));

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

jest.mock("react-native-gesture-handler", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    GestureHandlerRootView: (
      props: Readonly<{ children?: React.ReactNode; style?: unknown }>,
    ) => <View>{props.children}</View>,
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
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  function Stack({
    children,
  }: Readonly<{ children?: React.ReactNode }>): React.JSX.Element {
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
      >
        {children}
      </View>
    );
  }

  // Screens configure their native header through `Stack.Screen`; surface
  // the configured title the way the native header would (as a heading).
  function StackScreen({
    name,
    options,
  }: {
    name?: string;
    options?: { headerShown?: boolean; presentation?: string; title?: string };
  }): React.JSX.Element | null {
    // An untitled route declaration still surfaces its header visibility.
    if (name && !options?.title)
      return (
        <View
          testID={`route-${name}`}
          {...{ headerShown: options?.headerShown }}
        />
      );
    return options?.title ? (
      <Text
        accessibilityRole="header"
        testID={name ? `screen-${name}` : undefined}
        {...{ presentation: options.presentation }}
      >
        {options.title}
      </Text>
    ) : null;
  }
  Stack.Screen = StackScreen;

  function MockThemeProvider({
    children,
    value,
  }: Readonly<{
    children?: React.ReactNode;
    value: { colors: { card: string }; dark: boolean };
  }>) {
    return (
      <View
        accessibilityLabel={`navigation theme ${value.dark ? "dark" : "light"} ${value.colors.card}`}
      >
        {children}
      </View>
    );
  }
  return {
    DarkTheme: { dark: true },
    DefaultTheme: { dark: false },
    ThemeProvider: MockThemeProvider,
    Stack,
    useFocusEffect: (callback: () => (() => void) | void) =>
      jest
        .requireActual<typeof import("react")>("react")
        .useEffect(callback, [callback]),
  };
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
const originalAppMode = process.env.EXPO_PUBLIC_APP_MODE;

beforeEach(() => {
  process.env.EXPO_PUBLIC_APP_MODE = "local-fixture";
  mockRouterShouldThrow = false;
  mockProductionDatabaseFactory.mockClear();
  mockShellDatabaseClose.mockClear();
  mockShellRepository.ensureFixtureConversation.mockClear();
  consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  if (originalAppMode === undefined) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = originalAppMode;
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

  test("declares the C3 input routes as titled modals, so a link opening groups/join still gets them", async () => {
    const RootLayout = loadActualRoute(
      "../../src/app/_layout",
      "src/app/_layout.tsx",
    );
    const screen = await render(<RootLayout />);
    for (const [name, title] of [
      ["groups/create", "새 그룹"],
      ["groups/join", "초대 코드로 가입"],
      ["groups/[groupId]/topics/new", "새 주제"],
    ] as const) {
      const route = screen.getByTestId(`screen-${name}`);
      expect(route.props.presentation).toBe("modal");
      expect(route.props.children).toBe(title);
    }
  });

  test("the entry route never shows a header titled with its path (device regression: `index` while its redirect was pending)", async () => {
    const RootLayout = loadActualRoute(
      "../../src/app/_layout",
      "src/app/_layout.tsx",
    );
    const screen = await render(<RootLayout />);
    expect(screen.getByTestId("route-index").props.headerShown).toBe(false);
  });

  test("hands react-navigation a dark theme when the system scheme is dark (iOS header follows dark mode)", async () => {
    const useColorSchemeMock = jest.requireMock<{ default: jest.Mock }>(
      "react-native/Libraries/Utilities/useColorScheme",
    ).default;
    useColorSchemeMock.mockReturnValue("dark");
    try {
      const RootLayout = loadActualRoute(
        "../../src/app/_layout",
        "src/app/_layout.tsx",
      );
      const screen = await render(<RootLayout />);
      expect(
        screen.getByLabelText("navigation theme dark #000000"),
      ).toBeTruthy();
      expect(screen.getByLabelText("Expo Router stack dark")).toBeTruthy();
    } finally {
      useColorSchemeMock.mockReturnValue("light");
    }
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

  // E7a/C13/AUTH-AC2: the fixture screen moved from `app/index.tsx` (now a
  // pure redirector, see connected-index-route.test.tsx) to its own
  // `/local-fixture` route -- this test now exercises that route file
  // directly. `ChatScreen`/`chat-fixture.ts` themselves are unmodified.
  test("binds the actual local-fixture route to one fixture selector and the exact local fixture notice", async () => {
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

    const LocalFixtureRoute = loadActualRoute(
      "../../src/app/local-fixture",
      "src/app/local-fixture.tsx",
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
        <LocalFixtureRoute />
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
