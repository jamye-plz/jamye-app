import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { AccountScreen } from "@/features/home/ui/account-screen";

type AccountScopeRenderedState =
  | null
  | Readonly<{ status: "opening" }>
  | Readonly<{ database: unknown; status: "ready" }>
  | Readonly<{ error: Error; status: "error" }>;

const profile = {
  id: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
  provider: "kakao",
  nickname: "닉네임",
  avatarUrl: null,
  createdAt: "2020-01-01T00:00:00Z",
};
const mockLogout = jest.fn();
let mockPrincipal: Readonly<{
  origin: string;
  userId: string;
  epoch: number;
}> | null = { origin: "https://api.example", userId: profile.id, epoch: 1 };
let mockProfile: typeof profile | null = profile;
let mockAccountState: AccountScopeRenderedState = {
  status: "ready",
  database: {},
};
const mockRetry = jest.fn();

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));
jest.mock("@/core/providers/session-provider", () => ({
  useSession: jest.fn(() => ({
    state: { status: "signed-in", profile: mockProfile, message: null },
    principal: mockPrincipal,
    login: jest.fn(),
    logout: mockLogout,
    restore: jest.fn(),
    retryProfile: jest.fn(),
  })),
}));
jest.mock("@/core/providers/app-providers", () => ({
  useAccountScope: jest.fn(() => ({
    state: mockAccountState,
    retry: mockRetry,
  })),
}));
jest.mock("@/features/home/ui/connection-diagnostics", () => {
  const { Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ConnectionDiagnostics: () => (
      <RNText testID="connection-diagnostics">diagnostics</RNText>
    ),
  };
});
const mockPushDisable = jest.fn().mockResolvedValue(undefined);
jest.mock("@/features/notifications/model/push-lifecycle-provider", () => ({
  usePushLifecycle: jest.fn(() => ({
    disable: mockPushDisable,
    enable: jest.fn(),
    expoToken: null,
    previewEnabled: false,
    setMessagePreview: jest.fn(),
    state: { status: "deleted" },
  })),
}));
jest.mock("@/features/notifications/ui/notification-settings-section", () => {
  const { Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    NotificationSettingsSection: () => (
      <RNText testID="notification-settings-section">알림 설정</RNText>
    ),
  };
});
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

describe("account screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrincipal = {
      origin: "https://api.example",
      userId: profile.id,
      epoch: 1,
    };
    mockProfile = profile;
    mockAccountState = { status: "ready", database: {} };
  });

  test("shows the validated current profile, diagnostics, and only a logout action", async () => {
    const screen = await render(
      <AppThemeProvider>
        <AccountScreen />
      </AppThemeProvider>,
    );
    expect(screen.getByText("닉네임")).toBeTruthy();
    expect(screen.getByText(/kakao 계정으로 로그인됨/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
    expect(screen.getByTestId("connection-diagnostics")).toBeTruthy();
  });

  test("logs out through the shared session and prevents a duplicate submit", async () => {
    let resolveLogout: () => void = () => undefined;
    mockLogout.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const screen = await render(
      <AppThemeProvider>
        <AccountScreen />
      </AppThemeProvider>,
    );
    const button = screen.getByRole("button", { name: "로그아웃" });
    await fireEvent.press(button);
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockPushDisable).toHaveBeenCalledTimes(1);
    expect(mockPushDisable.mock.invocationCallOrder[0]).toBeLessThan(
      mockLogout.mock.invocationCallOrder[0],
    );
    await act(async () => {
      resolveLogout();
      await Promise.resolve();
    });
  });

  test("renders nothing when no validated principal is present, never leaking a stale profile", async () => {
    mockPrincipal = null;
    const screen = await render(
      <AppThemeProvider>
        <AccountScreen />
      </AppThemeProvider>,
    );
    expect(screen.queryByText("닉네임")).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  test("shows an explicit retry for a failed account-storage open, without any fixture fallback text", async () => {
    mockAccountState = { error: new Error("open failed"), status: "error" };
    const screen = await render(
      <AppThemeProvider>
        <AccountScreen />
      </AppThemeProvider>,
    );
    expect(screen.getByText(/로컬 계정 저장소를 열 수 없습니다/)).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "계정 저장소 다시 시도" }),
    );
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/fixture/i)).toBeNull();
  });

  test("shows an accessible opening indicator for account storage without exposing business data", async () => {
    mockAccountState = { status: "opening" };
    const screen = await render(
      <AppThemeProvider>
        <AccountScreen />
      </AppThemeProvider>,
    );
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText("로컬 계정 저장소 준비 중…")).toBeTruthy();
  });
});
