import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType } from "react";

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

// Connected-auth harness: the root layout renders the real `AppProviders`
// (the only runtime), with its session controller and account scope replaced
// by signed-out fakes so no secure storage, network, or SQLite is touched.
jest.mock("../../src/core/providers/app-providers", () => {
  const mockReact = jest.requireActual<typeof import("react")>("react");
  const actual = jest.requireActual<
    typeof import("../../src/core/providers/app-providers")
  >("../../src/core/providers/app-providers");
  const signedOut = {
    status: "signed-out" as const,
    profile: null,
    message: null,
  };
  const createSessionController = () => ({
    getState: () => signedOut,
    getGeneration: () => 1,
    subscribe: () => () => undefined,
    dispose: () => undefined,
    restore: async () => undefined,
    signIn: async () => undefined,
    logout: async () => undefined,
    retryProfile: async () => undefined,
  });
  const createAccountScope = () => ({
    getState: () => null,
    setPrincipal: () => undefined,
    subscribe: () => () => undefined,
  });

  const RealAppProviders = actual.AppProviders as React.ComponentType<
    Record<string, unknown>
  >;

  return {
    ...actual,
    AppProviders: ({ children }: { children?: React.ReactNode }) =>
      mockReact.createElement(
        RealAppProviders,
        { createAccountScope, createSessionController },
        children,
      ),
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
        {...{
          headerShown: options?.headerShown,
          presentation: options.presentation,
        }}
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
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (callback: () => (() => void) | void) =>
      jest
        .requireActual<typeof import("react")>("react")
        .useEffect(callback, [callback]),
  };
});

type DefaultComponentModule = { default?: unknown };
type NamedComponentModule = Record<string, unknown>;

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

let consoleErrorSpy: jest.SpyInstance;
const originalApiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
const originalMediaOrigin = process.env.EXPO_PUBLIC_MEDIA_ORIGIN;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
  process.env.EXPO_PUBLIC_MEDIA_ORIGIN = "https://media.example.com";
  mockRouterShouldThrow = false;
  consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  if (originalApiOrigin === undefined)
    delete process.env.EXPO_PUBLIC_API_ORIGIN;
  else process.env.EXPO_PUBLIC_API_ORIGIN = originalApiOrigin;
  if (originalMediaOrigin === undefined)
    delete process.env.EXPO_PUBLIC_MEDIA_ORIGIN;
  else process.env.EXPO_PUBLIC_MEDIA_ORIGIN = originalMediaOrigin;
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
      ["groups/[groupId]/rename", "그룹 이름 변경"],
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

  // F-7 (task-coord-device-acceptance run 8447a0dd, user decision A17):
  // device VoiceOver read the native back button on every screen pushed on
  // the root stack over the chat screen ((tabs) -> chat) as "(tabs), Back
  // button" -- an unlabeled back button's accessibility text falls back to
  // the *previous* screen's route name, and "(tabs)" never set its own
  // `title` (only `headerShown: false`, since the tab bar draws its own
  // chrome). A chat can be pushed from any tab, so a single static Korean
  // phrase (not a tab-specific title) is used here, deliberately worded to
  // avoid duplicating the back button's own "뒤로가기" trait/label.
  test("gives the root (tabs) screen a Korean back-button label instead of exposing its route name (F-7)", async () => {
    const RootLayout = loadActualRoute(
      "../../src/app/_layout",
      "src/app/_layout.tsx",
    );
    const screen = await render(<RootLayout />);
    const route = screen.getByTestId("screen-(tabs)");
    expect(route.props.children).toBe("이전 화면");
    // The tab bar still draws its own header chrome -- this title must stay
    // invisible everywhere, exactly like the pre-existing index assertion
    // above.
    expect(route.props.headerShown).toBe(false);
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

  test("declares the sign-in route but no local-fixture route (fixture mode was removed)", async () => {
    const RootLayout = loadActualRoute(
      "../../src/app/_layout",
      "src/app/_layout.tsx",
    );
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("route-(auth)/sign-in")).toBeTruthy();
    expect(screen.queryByTestId("route-local-fixture")).toBeNull();
  });
});
