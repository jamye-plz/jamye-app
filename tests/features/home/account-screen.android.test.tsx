import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";

const profile = {
  id: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
  provider: "google",
  nickname: "안드로이드닉",
  avatarUrl: null,
  createdAt: "2020-01-01T00:00:00Z",
};
const mockLogout = jest.fn().mockResolvedValue(undefined);
const mockRouterPush = jest.fn();
let mockPrincipal: Readonly<{
  origin: string;
  userId: string;
  epoch: number;
}> | null = { origin: "https://api.example", userId: profile.id, epoch: 1 };
let mockAccountState: unknown = { status: "ready", database: {} };
const mockRetry = jest.fn();
const mockPushDisable = jest.fn().mockResolvedValue(undefined);
const mockDeleteAccount = jest.fn();

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), push: mockRouterPush }),
}));
jest.mock("@/core/providers/session-provider", () => ({
  useSession: jest.fn(() => ({
    applyProfile: jest.fn(),
    authorizedRequest: jest.fn(),
    state: { status: "signed-in", profile, message: null },
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
jest.mock("@/features/account/model/use-account-lifecycle", () => ({
  useAccountLifecycle: jest.fn(() => ({
    updateNickname: jest.fn(),
    deleteAccount: mockDeleteAccount,
  })),
}));
jest.mock("@/features/notifications/ui/notification-settings-section", () => {
  const { Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    NotificationSettingsSection: () => (
      <RNText testID="notification-settings-section">알림</RNText>
    ),
  };
});
jest.mock("@/features/account/ui/developer-section", () => {
  const { Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    DeveloperSection: () => <RNText testID="developer-section">개발자</RNText>,
  };
});
jest.mock("@/shared/ui/confirm-alert", () => {
  const {
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ConfirmAlert: (props: {
      isPresented: boolean;
      title: string;
      message?: string;
      confirmLabel: string;
      onConfirm: () => void;
      onDismiss: () => void;
      testID?: string;
    }) => {
      // The real ConfirmAlert is a native alert: it must sit inside a Host.
      // `require` (not `jest.requireMock`) returns the same "@expo/ui" mock
      // instance the component under test imports, so the Host context matches.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use ES import
      const hostGuard = require("@expo/ui") as {
        useMockHostGuard: (component: string) => void;
      };
      hostGuard.useMockHostGuard("ConfirmAlert");
      if (!props.isPresented) return null;
      return (
        <View testID={props.testID}>
          <RNText accessibilityRole="header">{props.title}</RNText>
          {props.message ? <RNText>{props.message}</RNText> : null}
          <Pressable
            accessibilityLabel={props.confirmLabel}
            accessibilityRole="button"
            onPress={props.onConfirm}
            testID={`${props.testID}-confirm`}
          />
        </View>
      );
    },
  };
});
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

async function renderScreen() {
  const { AccountScreen } = jest.requireActual<
    typeof import("@/features/home/ui/account-screen.android")
  >("@/features/home/ui/account-screen.android");
  return render(
    <AppThemeProvider>
      <AccountScreen />
    </AppThemeProvider>,
  );
}

describe("account screen (android)", () => {
  const originalDev = __DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogout.mockResolvedValue(undefined);
    mockPushDisable.mockResolvedValue(undefined);
    mockPrincipal = {
      origin: "https://api.example",
      userId: profile.id,
      epoch: 1,
    };
    mockAccountState = { status: "ready", database: {} };
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
  });

  afterEach(() => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
  });

  test("shows the 72pt profile header, provider label, and navigates from the nickname row", async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId("account-avatar").props.size).toBe(72);
    expect(screen.getByText("Google 계정으로 로그인됨")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("nickname-row"));
    expect(mockRouterPush).toHaveBeenCalledWith("/account/nickname");
  });

  test("shows the developer section only when __DEV__", async () => {
    const dev = await renderScreen();
    expect(dev.getByTestId("developer-section")).toBeTruthy();
  });

  test("hides the developer section and shows the storage-error fallback to everyone when not __DEV__", async () => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    mockAccountState = { error: new Error("x"), status: "error" };
    const screen = await renderScreen();
    expect(screen.queryByTestId("developer-section")).toBeNull();
    expect(screen.getByTestId("storage-error-row")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("storage-retry-row"));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  test("logs out via the confirm alert", async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId("logout-row"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("logout-confirm-alert-confirm"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  test("deletes the account via the confirm alert", async () => {
    mockDeleteAccount.mockResolvedValue({ status: "ok" });
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId("delete-account-row"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("delete-confirm-alert-confirm"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  test("renders nothing without a validated principal", async () => {
    mockPrincipal = null;
    const screen = await renderScreen();
    expect(screen.toJSON()).toBeNull();
  });
});
