import { fireEvent, render } from "@testing-library/react-native";
import React, { type ReactNode } from "react";
import { StyleSheet } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { authIntroText, AuthScreen } from "@/features/auth/ui/auth-screen";

type AuthState = Readonly<{
  status: "loading" | "signed-out" | "signing-in" | "signed-in" | "error";
  profile: Readonly<{
    id: string;
    provider: string;
    nickname: string;
    avatarUrl: string | null;
    createdAt: string;
  }> | null;
  message: string | null;
  retryAction?: "restore" | "retryProfile" | "logout";
}>;

const mockLogin = jest.fn();
const mockLoginWithApple = jest.fn();
const mockLogout = jest.fn();
const mockRetryProfile = jest.fn();
const mockRestore = jest.fn();
let mockState: AuthState = {
  status: "signed-out",
  profile: null,
  message: null,
};
jest.mock("expo-auth-session", () => ({
  makeRedirectUri: ({ scheme, path }: { scheme: string; path: string }) =>
    `${scheme}://${path}`,
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));
jest.mock("@/core/providers/session-provider", () => ({
  useSession: jest.fn(() => ({
    state: mockState,
    principal: null,
    login: mockLogin,
    loginWithApple: mockLoginWithApple,
    logout: mockLogout,
    restore: mockRestore,
    retryProfile: mockRetryProfile,
  })),
}));
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));
jest.mock("expo-image", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { Image: RNImage } = require("react-native");
  return {
    Image: (props: { source?: unknown }) => (
      <RNImage source={props.source} testID="brand-logo-image" />
    ),
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  background: jest.fn(),
  buttonStyle: jest.fn(),
  contentShape: jest.fn(),
  disabled: jest.fn(),
  font: jest.fn(),
  foregroundStyle: jest.fn(),
  frame: jest.fn(),
  opacity: jest.fn(),
  padding: jest.fn(),
  shapes: { capsule: jest.fn() },
  strokeBorder: jest.fn(),
}));
// The SwiftUI `Alert`/`Button`/`Spacer` used by `SystemFeedbackHost`, the
// `Button`/`HStack`/`ProgressView` used by `BrandLoginButton`, and the
// `Button`/`HStack`/`Image`/`ProgressView`/`Text` used by `AppleLoginButton`
// are all `@expo/ui/swift-ui`, mocked once here the same way as
// system-feedback.test.tsx (which exercises the identical upstream Alert).
jest.mock("@expo/ui/swift-ui", () => {
  const { ActivityIndicator, Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Alert(
    props: Readonly<{
      children?: ReactNode;
      isPresented?: boolean;
      testID?: string;
      title?: string;
    }>,
  ) {
    if (!props.isPresented) return null;
    return (
      <View testID={props.testID ?? "alert"}>
        <Text accessibilityRole="header">{props.title}</Text>
        {props.children}
      </View>
    );
  }
  const slot = () =>
    function MockSlot({ children }: MockChildren) {
      return <View>{children}</View>;
    };
  Alert.Trigger = slot();
  Alert.Actions = slot();
  Alert.Message = slot();
  function Button(
    props: Readonly<{
      children?: ReactNode;
      label?: string;
      onPress?: () => void;
      role?: string;
      modifiers?: readonly unknown[];
    }>,
  ) {
    return (
      <Pressable
        accessibilityLabel={props.label}
        accessibilityRole="button"
        disabled={!props.onPress}
        onPress={props.onPress}
      >
        {props.children ?? <Text>{props.label}</Text>}
      </Pressable>
    );
  }
  function HStack({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  function ProgressView({ testID }: Readonly<{ testID?: string }>) {
    return <ActivityIndicator testID={testID} />;
  }
  function Spacer() {
    return <View testID="spacer" />;
  }
  function MockText({ children }: MockChildren) {
    return <Text>{children}</Text>;
  }
  function MockImage({ testID }: Readonly<{ testID?: string }>) {
    return <View testID={testID} />;
  }
  return {
    Alert,
    Button,
    HStack,
    Image: MockImage,
    ProgressView,
    Spacer,
    Text: MockText,
  };
});

describe("connected auth screen (session-driven, no owned controller)", () => {
  const previousMode = process.env.EXPO_PUBLIC_APP_MODE;
  const previousOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_APP_MODE = "connected-auth";
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example";
    jest.clearAllMocks();
    mockState = { status: "signed-out", profile: null, message: null };
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_APP_MODE = previousMode;
    process.env.EXPO_PUBLIC_API_ORIGIN = previousOrigin;
  });

  test("puts the app name at the centre of the whole screen, the intro below it without moving it (device: it sat left-aligned, centred only above the buttons)", async () => {
    const screen = await render(
      <AppThemeProvider>
        <AuthScreen />
      </AppThemeProvider>,
    );
    expect(
      StyleSheet.flatten(screen.getByTestId("auth-brand").props.style),
    ).toMatchObject({
      bottom: 0,
      justifyContent: "center",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    });
    expect(
      StyleSheet.flatten(
        screen.getByRole("header", { name: "잼얘좀" }).props.style,
      ),
    ).toMatchObject({ textAlign: "center" });
    expect(
      StyleSheet.flatten(screen.getByTestId("auth-intro").props.style),
    ).toMatchObject({ position: "absolute", textAlign: "center", top: "100%" });
    // Still read before the buttons.
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf("잼얘좀")).toBeLessThan(
      tree.indexOf("카카오로 계속하기"),
    );
  });

  test("never renders a signed-in profile card; the shared session drives sign-in/out only", async () => {
    mockState = {
      status: "signed-in",
      profile: {
        id: "id",
        provider: "kakao",
        nickname: "name",
        avatarUrl: null,
        createdAt: "date",
      },
      message: null,
    };
    const screen = await render(
      <AppThemeProvider>
        <AuthScreen />
      </AppThemeProvider>,
    );
    expect(screen.queryByText("name")).toBeNull();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });

  test("offers a retry for a recoverable profile error via the shared session", async () => {
    mockState = {
      status: "error",
      profile: null,
      message: "fixed",
      retryAction: "retryProfile",
    };
    const screen = await render(
      <AppThemeProvider>
        <AuthScreen />
      </AppThemeProvider>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "프로필 다시 시도" }),
    );
    expect(mockRetryProfile).toHaveBeenCalledTimes(1);
  });

  test("restarts login through provider choices when no session was established, offering only 확인 (no retry action)", async () => {
    mockState = { status: "error", profile: null, message: "로그인 실패" };
    const screen = await render(
      <AppThemeProvider>
        <AuthScreen />
      </AppThemeProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "프로필 다시 시도" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "확인" })).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "카카오로 계속하기" }),
    );
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockRetryProfile).not.toHaveBeenCalled();
  });

  test.each(["loading", "signing-in"] as const)(
    "disables every provider button (Kakao/Google/Apple) while %s",
    async (status) => {
      mockState = { status, profile: null, message: null };
      const screen = await render(
        <AppThemeProvider>
          <AuthScreen />
        </AppThemeProvider>,
      );
      const kakao = screen.getByRole("button", { name: "카카오로 계속하기" });
      const google = screen.getByRole("button", {
        name: "Google로 계속하기",
      });
      const apple = await screen.findByRole("button", {
        name: "Apple로 로그인",
      });
      expect(kakao).toBeDisabled();
      expect(google).toBeDisabled();
      expect(apple).toBeDisabled();
      await fireEvent.press(kakao);
      await fireEvent.press(google);
      await fireEvent.press(apple);
      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockLoginWithApple).not.toHaveBeenCalled();
    },
  );

  test("returns to the original screen with no announcement after a cancelled login", async () => {
    mockState = {
      status: "signed-out",
      profile: null,
      message: "로그인이 취소되었습니다.",
    };
    const screen = await render(
      <AppThemeProvider>
        <AuthScreen />
      </AppThemeProvider>,
    );
    expect(screen.queryByText("로그인이 취소되었습니다.")).toBeNull();
    expect(screen.queryByTestId("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "카카오로 계속하기" }),
    ).toBeEnabled();
  });

  test.each([
    ["restore", "세션 복원 다시 시도", mockRestore],
    ["logout", "로그아웃 다시 시도", mockLogout],
  ] as const)(
    "retries %s instead of requesting a profile",
    async (retryAction, label, operation) => {
      mockState = {
        status: "error",
        profile: null,
        message: "저장소 오류",
        retryAction,
      };
      const screen = await render(
        <AppThemeProvider>
          <AuthScreen />
        </AppThemeProvider>,
      );
      operation.mockClear();
      await fireEvent.press(screen.getByRole("button", { name: label }));
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockRetryProfile).not.toHaveBeenCalled();
    },
  );

  test("offers accessible provider choices and sends a fixed callback URI through the shared session", async () => {
    const screen = await render(
      <AppThemeProvider>
        <AuthScreen />
      </AppThemeProvider>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "카카오로 계속하기" }),
    );
    expect(mockLogin).toHaveBeenCalledWith(
      "kakao",
      "https://api.example/api/v1/auth/oauth/kakao/callback",
      "jamye://oauth/kakao",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Google로 계속하기" }),
    );
    expect(mockLogin).toHaveBeenLastCalledWith(
      "google",
      "https://api.example/api/v1/auth/oauth/google/callback",
      "jamye://oauth/google",
    );
  });

  test("throws when connected-auth is configured without an API origin", async () => {
    delete process.env.EXPO_PUBLIC_API_ORIGIN;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      render(
        <AppThemeProvider>
          <AuthScreen />
        </AppThemeProvider>,
      ),
    ).rejects.toThrow(/API_ORIGIN/);
    consoleErrorSpy.mockRestore();
  });

  // U3/E14: order, size parity (48pt capsule/shared max width comes from the
  // same column as Kakao/Google -- no separate assertion needed), and copy.
  describe("U3/E14 Apple button", () => {
    test("orders Kakao -> Google -> Apple and labels it 'Apple로 로그인'", async () => {
      const screen = await render(
        <AppThemeProvider>
          <AuthScreen />
        </AppThemeProvider>,
      );
      await screen.findByRole("button", { name: "Apple로 로그인" });
      const tree = JSON.stringify(screen.toJSON());
      expect(tree.indexOf("카카오로 계속하기")).toBeLessThan(
        tree.indexOf("Google로 계속하기"),
      );
      expect(tree.indexOf("Google로 계속하기")).toBeLessThan(
        tree.indexOf("Apple로 로그인"),
      );
    });

    test("pressing Apple calls session.loginWithApple with no provider/redirect args", async () => {
      const screen = await render(
        <AppThemeProvider>
          <AuthScreen />
        </AppThemeProvider>,
      );
      const apple = await screen.findByRole("button", {
        name: "Apple로 로그인",
      });
      await fireEvent.press(apple);
      expect(mockLoginWithApple).toHaveBeenCalledTimes(1);
      expect(mockLoginWithApple).toHaveBeenCalledWith();
    });

    test("iOS subtitle names all three providers", async () => {
      const screen = await render(
        <AppThemeProvider>
          <AuthScreen />
        </AppThemeProvider>,
      );
      expect(screen.getByTestId("auth-intro").props.children).toBe(
        "카카오, Google 또는 Apple 계정으로 로그인합니다.",
      );
    });
  });

  // Babel inlines `process.env.EXPO_OS` at transform time (jest is always
  // "ios" -- see src/core/theme/tokens.ts's identical precedent), so
  // mutating that env var at test runtime cannot exercise the non-iOS
  // branch through a render. `authIntroText` is a plain exported function
  // instead, unit-tested here directly with a literal argument.
  describe("authIntroText", () => {
    test("names all three providers on iOS", () => {
      expect(authIntroText("ios")).toBe(
        "카카오, Google 또는 Apple 계정으로 로그인합니다.",
      );
    });

    test("keeps the original two-provider copy on every other platform", () => {
      expect(authIntroText("android")).toBe(
        "카카오 또는 Google 계정으로 로그인합니다.",
      );
      expect(authIntroText(undefined)).toBe(
        "카카오 또는 Google 계정으로 로그인합니다.",
      );
    });
  });
});
