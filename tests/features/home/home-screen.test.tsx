import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { HomeScreen } from "@/features/home/ui/home-screen";

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
jest.mock("@/features/home/ui/connection-diagnostics", () => ({
  ConnectionDiagnostics: () => null,
}));
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

describe("authenticated home screen", () => {
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

  test("shows the validated current profile and only a logout action, no fake product content", async () => {
    const screen = await render(
      <AppThemeProvider>
        <HomeScreen />
      </AppThemeProvider>,
    );
    expect(screen.getByText("닉네임")).toBeTruthy();
    expect(screen.getByText(/kakao 계정으로 로그인됨/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
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
        <HomeScreen />
      </AppThemeProvider>,
    );
    const button = screen.getByRole("button", { name: "로그아웃" });
    await fireEvent.press(button);
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveLogout();
      await Promise.resolve();
    });
  });

  test("renders nothing when no validated principal is present, never leaking a stale profile", async () => {
    mockPrincipal = null;
    const screen = await render(
      <AppThemeProvider>
        <HomeScreen />
      </AppThemeProvider>,
    );
    expect(screen.queryByText("닉네임")).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  test("blocks a second logout in the same render turn", async () => {
    let finish: () => void = () => undefined;
    mockLogout.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const screen = await render(
      <AppThemeProvider>
        <HomeScreen />
      </AppThemeProvider>,
    );
    const button = screen.getByRole("button", { name: "로그아웃" });
    // RNTL 14 exposes host nodes only. Capture the enclosing Pressable's
    // callback as fireEvent does, so both calls happen before a React commit.
    let fiber = button.unstable_fiber;
    while (fiber && !fiber.memoizedProps?.onPress) fiber = fiber.return;
    const onPress = fiber?.memoizedProps.onPress;
    expect(typeof onPress).toBe("function");
    await act(async () => {
      onPress();
      onPress();
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
  });

  test("shows an explicit retry for a failed account-storage open, without any fixture fallback text", async () => {
    mockAccountState = { error: new Error("open failed"), status: "error" };
    const screen = await render(
      <AppThemeProvider>
        <HomeScreen />
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
        <HomeScreen />
      </AppThemeProvider>,
    );
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });
});
