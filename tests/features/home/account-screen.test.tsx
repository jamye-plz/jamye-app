import { act, fireEvent, render, within } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";

import { AccountScreen } from "@/features/home/ui/account-screen";

const profile = {
  id: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
  provider: "kakao",
  nickname: "닉네임",
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
const mockUpdateNickname = jest.fn();
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
    updateNickname: mockUpdateNickname,
    deleteAccount: mockDeleteAccount,
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
jest.mock("@/features/account/ui/developer-section", () => {
  const { Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    DeveloperSection: () => (
      <RNText testID="developer-section">개발자 섹션</RNText>
    ),
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
      cancelLabel?: string;
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
            accessibilityLabel={props.cancelLabel ?? "취소"}
            accessibilityRole="button"
            onPress={props.onDismiss}
            testID={`${props.testID}-cancel`}
          />
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
jest.mock("@expo/ui/swift-ui", () => {
  const {
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Form({ children }: MockChildren) {
    return <View testID="form">{children}</View>;
  }
  function Section({
    children,
    footer,
    title,
  }: MockChildren & { footer?: ReactNode; title?: string }) {
    return (
      <View testID="section">
        {title ? <RNText>{title}</RNText> : null}
        {children}
        {footer}
      </View>
    );
  }
  function Text({ children, testID }: MockChildren & { testID?: string }) {
    return <RNText testID={testID}>{children}</RNText>;
  }
  function Button(
    props: Readonly<{
      label?: string;
      onPress?: () => void;
      role?: string;
      modifiers?: unknown[];
      testID?: string;
    }>,
  ) {
    return (
      <Pressable
        accessibilityLabel={props.label}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(props.modifiers?.length) }}
        onPress={props.onPress}
        testID={props.testID}
      >
        <RNText>{props.label}</RNText>
      </Pressable>
    );
  }
  function Stack({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  function Image({ systemName }: Readonly<{ systemName?: string }>) {
    return <View testID={`symbol-${systemName}`} />;
  }
  return { Button, Form, HStack: Stack, Image, Section, Text, VStack: Stack };
});
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

async function renderScreen() {
  return render(<AccountScreen />);
}

describe("account screen (ios)", () => {
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

  test("shows the profile header (72pt avatar), provider label, and a nickname row that opens the C3 screen", async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId("account-avatar").props.size).toBe(72);
    expect(screen.getAllByText("닉네임").length).toBeGreaterThan(0);
    expect(screen.getByText("카카오 계정으로 로그인됨")).toBeTruthy();
    // A1: the iOS nickname row ends in the current nickname and a chevron.
    const nicknameRow = within(screen.getByTestId("nickname-row"));
    expect(nicknameRow.getByTestId("symbol-chevron.right")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("nickname-row"));
    expect(mockRouterPush).toHaveBeenCalledWith("/account/nickname");
  });

  test("shows the notification settings and developer sections when __DEV__", async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId("notification-settings-section")).toBeTruthy();
    expect(screen.getByTestId("developer-section")).toBeTruthy();
  });

  test("hides the developer section and shows the storage-error fallback to everyone when not __DEV__", async () => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    mockAccountState = { error: new Error("open failed"), status: "error" };
    const screen = await renderScreen();
    expect(screen.queryByTestId("developer-section")).toBeNull();
    expect(screen.getByText(/로컬 계정 저장소를 열 수 없습니다/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("storage-retry-row"));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  test("keeps the everyone-visible storage-error row hidden when __DEV__ (the developer section already covers it)", async () => {
    mockAccountState = { error: new Error("open failed"), status: "error" };
    const screen = await renderScreen();
    expect(screen.queryByTestId("storage-error-row")).toBeNull();
  });

  test("logs out through a confirm alert and the shared session, in P4 order", async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "로그아웃" }));
    expect(screen.getByText("로그아웃할까요?")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("logout-confirm-alert-confirm"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPushDisable).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockPushDisable.mock.invocationCallOrder[0]).toBeLessThan(
      mockLogout.mock.invocationCallOrder[0],
    );
  });

  test("dismissing the logout confirm alert never logs out", async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "로그아웃" }));
    await fireEvent.press(screen.getByTestId("logout-confirm-alert-cancel"));
    expect(mockLogout).not.toHaveBeenCalled();
    expect(screen.queryByTestId("logout-confirm-alert")).toBeNull();
  });

  test("deletes the account through a confirm alert on success, with no RN Alert.alert involved", async () => {
    mockDeleteAccount.mockResolvedValue({ status: "ok" });
    const screen = await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    const alert = screen.getByTestId("delete-confirm-alert");
    expect(
      within(alert).getByText(
        "정말 계정을 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("delete-confirm-alert-confirm"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("delete-confirm-alert")).toBeNull();
  });

  test("shows the blocked message when the account can't be deleted yet", async () => {
    mockDeleteAccount.mockResolvedValue({ status: "blocked" });
    const screen = await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      fireEvent.press(screen.getByTestId("delete-confirm-alert-confirm"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText("그룹 소유권을 먼저 이전한 뒤 다시 시도해 주세요."),
    ).toBeTruthy();
  });

  test("shows a generic error message when the delete request fails", async () => {
    mockDeleteAccount.mockRejectedValue(new Error("network"));
    const screen = await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      fireEvent.press(screen.getByTestId("delete-confirm-alert-confirm"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText(
        "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
  });

  test("renders nothing when no validated principal is present, never leaking a stale profile", async () => {
    mockPrincipal = null;
    const screen = await renderScreen();
    expect(screen.toJSON()).toBeNull();
  });
});
