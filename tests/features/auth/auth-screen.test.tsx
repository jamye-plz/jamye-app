import { fireEvent, render } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import React from "react";

import {
  createAuthController,
  type AuthState,
} from "@/core/auth/auth-controller";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { AuthScreen } from "@/features/auth/ui/auth-screen";

const mockSignIn = jest.fn();
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
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("@/core/auth/auth-api", () => ({
  createAuthApi: jest.fn(() => ({})),
}));
jest.mock("@/core/auth/pkce", () => ({ createPkcePair: jest.fn() }));
jest.mock("@/core/auth/secure-session-store", () => ({
  secureSessionStore: {},
}));
jest.mock("@/core/auth/auth-controller", () => ({
  createAuthController: jest.fn(() => ({
    getState: () => mockState,
    subscribe: (listener: (value: unknown) => void) => {
      listener(mockState);
      return () => undefined;
    },
    restore: mockRestore,
    signIn: mockSignIn,
    logout: mockLogout,
    retryProfile: mockRetryProfile,
  })),
}));
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

describe("connected auth screen", () => {
  const previousMode = process.env.EXPO_PUBLIC_APP_MODE;
  const previousOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_APP_MODE = "connected-auth";
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example";
    jest.clearAllMocks();
    mockState = { status: "signed-out", profile: null, message: null };
  });
  test("renders a signed-in profile and logs out", async () => {
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
    expect(screen.getByText("name")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "로그아웃" }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
  test("offers a retry for a recoverable profile error", async () => {
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
  test("restarts login through provider choices when no session was established", async () => {
    mockState = { status: "error", profile: null, message: "로그인 실패" };
    const screen = await render(
      <AppThemeProvider>
        <AuthScreen />
      </AppThemeProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "프로필 다시 시도" }),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "카카오로 계속하기" }),
    );
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockRetryProfile).not.toHaveBeenCalled();
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
  test.each(["loading", "signing-in"] as const)(
    "disables provider buttons while %s",
    async (status) => {
      mockState = { status, profile: null, message: null };
      const screen = await render(
        <AppThemeProvider>
          <AuthScreen />
        </AppThemeProvider>,
      );
      const kakao = screen.getByRole("button", { name: "로그인 준비 중…" });
      const google = screen.getByRole("button", { name: "Google로 계속하기" });
      expect(kakao).toBeDisabled();
      expect(google).toBeDisabled();
      await fireEvent.press(kakao);
      await fireEvent.press(google);
      expect(mockSignIn).not.toHaveBeenCalled();
    },
  );
  test("shows a cancelled login as recoverable without a profile retry", async () => {
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
    expect(screen.getByText("로그인이 취소되었습니다.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "프로필 다시 시도" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "카카오로 계속하기" }),
    ).toBeEnabled();
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_APP_MODE = previousMode;
    process.env.EXPO_PUBLIC_API_ORIGIN = previousOrigin;
  });
  test("offers accessible provider choices and sends a fixed callback URI", async () => {
    const screen = await render(
      <AppThemeProvider>
        <AuthScreen />
      </AppThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId("auth-카카오로 계속하기"));
    expect(mockSignIn).toHaveBeenCalledWith(
      "kakao",
      "https://api.example/api/v1/auth/oauth/kakao/callback",
      "jamye://oauth/kakao",
    );
    await fireEvent.press(screen.getByTestId("auth-Google로 계속하기"));
    expect(mockSignIn).toHaveBeenLastCalledWith(
      "google",
      "https://api.example/api/v1/auth/oauth/google/callback",
      "jamye://oauth/google",
    );
  });
  test.each([
    [
      { type: "success", url: "jamye://oauth/kakao?code=fake" },
      { type: "success", url: "jamye://oauth/kakao?code=fake" },
    ],
    [{ type: "cancel" }, { type: "cancel" }],
    [{ type: "dismiss" }, { type: "dismiss" }],
  ])("adapts the system browser result %j", async (result, expected) => {
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValue(result as WebBrowser.WebBrowserAuthSessionResult);
    await render(
      <AppThemeProvider>
        <AuthScreen />
      </AppThemeProvider>,
    );
    const deps = jest.mocked(createAuthController).mock.calls[0][0];
    await expect(
      deps.openBrowser(
        "https://kauth.kakao.com/oauth/authorize",
        "jamye://oauth/kakao",
      ),
    ).resolves.toEqual(expected);
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      "https://kauth.kakao.com/oauth/authorize",
      "jamye://oauth/kakao",
    );
  });
});
