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
    loginWithApple: jest.fn(),
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
// AV-AC4: the avatar upload hook and the profile-photo menu are stood in so
// this file pins the screen's wiring; the real menus have their own tests in
// tests/features/account/ui/profile-photo-menu.*.test.tsx.
const mockAvatarUpload = {
  phase: "idle" as string,
  busy: false,
  progress: null as number | null,
  failure: null as { message: string; retryable: boolean } | null,
  hasAvatar: false,
  selectPhoto: jest.fn(),
  resetToDefault: jest.fn(),
  retry: jest.fn(),
  dismissFailure: jest.fn(),
};
jest.mock("@/features/account/model/use-avatar-upload", () => ({
  useAvatarUpload: () => mockAvatarUpload,
}));
jest.mock("@/features/account/ui/profile-photo-menu", () => {
  const { Pressable, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ProfilePhotoMenu: (props: {
      actions: readonly {
        key: string;
        label: string;
        disabled: boolean;
        onPress: () => void;
      }[];
      label?: React.ReactNode;
      testID?: string;
      expanded?: boolean;
      onExpandedChange?: (expanded: boolean) => void;
    }) => (
      <View testID={props.testID} {...({ expanded: props.expanded } as object)}>
        {props.label}
        {props.actions.map((action) => (
          <Pressable
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: action.disabled }}
            key={action.key}
            onPress={action.disabled ? undefined : action.onPress}
            testID={`${props.testID}-action-${action.key}`}
          />
        ))}
      </View>
    ),
  };
});
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
        "계정을 삭제할까요? 30일 안에 같은 계정으로 다시 로그인하면 복구할 수 있고, 30일이 지나면 되돌릴 수 없습니다.",
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

  // task-app-device fix1: a blocked/error delete result surfaces as a
  // single-button acknowledge alert (title "계정 삭제"), not an inline
  // caption under the delete row -- `getAllByText` staying at 1 proves the
  // inline caption is gone.
  test("shows a blocked failure alert (not an inline message) when the account can't be deleted yet, and 확인 dismisses it", async () => {
    mockDeleteAccount.mockResolvedValue({ status: "blocked" });
    const screen = await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      fireEvent.press(screen.getByTestId("delete-confirm-alert-confirm"));
      await Promise.resolve();
      await Promise.resolve();
    });
    const message = "그룹 소유권을 먼저 이전한 뒤 다시 시도해 주세요.";
    const alert = screen.getByTestId("delete-failure-alert");
    expect(within(alert).getByText(message)).toBeTruthy();
    expect(screen.getAllByText(message)).toHaveLength(1);
    await fireEvent.press(screen.getByTestId("delete-failure-alert-confirm"));
    expect(screen.queryByTestId("delete-failure-alert")).toBeNull();
  });

  test("shows a generic error failure alert (not an inline message) when the delete request fails, and 확인 dismisses it", async () => {
    mockDeleteAccount.mockRejectedValue(new Error("network"));
    const screen = await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      fireEvent.press(screen.getByTestId("delete-confirm-alert-confirm"));
      await Promise.resolve();
      await Promise.resolve();
    });
    const message = "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    const alert = screen.getByTestId("delete-failure-alert");
    expect(within(alert).getByText(message)).toBeTruthy();
    expect(screen.getAllByText(message)).toHaveLength(1);
    await fireEvent.press(screen.getByTestId("delete-failure-alert-confirm"));
    expect(screen.queryByTestId("delete-failure-alert")).toBeNull();
  });

  test("renders nothing when no validated principal is present, never leaking a stale profile", async () => {
    mockPrincipal = null;
    const screen = await renderScreen();
    expect(screen.toJSON()).toBeNull();
  });

  // U3/U7/AC5: provider label and delete-confirm copy for an Apple account.
  // `profile` is a module-level fixture the mocked useSession closes over,
  // so the provider is mutated in place and restored in `finally` (kept to
  // one dedicated test to avoid leaking state into the kakao-fixture tests
  // above).
  test("Apple 계정: 라벨은 'Apple 계정으로 로그인됨'이고 삭제 확인 문구는 기존 E9 문구 뒤에 재인증 안내를 덧붙인다", async () => {
    profile.provider = "apple";
    try {
      const screen = await renderScreen();
      expect(screen.getByText("Apple 계정으로 로그인됨")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
      const alert = screen.getByTestId("delete-confirm-alert");
      expect(
        within(alert).getByText(
          "계정을 삭제할까요? 30일 안에 같은 계정으로 다시 로그인하면 복구할 수 있고, 30일이 지나면 되돌릴 수 없습니다. 삭제하려면 Apple 인증을 한 번 더 진행합니다.",
        ),
      ).toBeTruthy();
    } finally {
      profile.provider = "kakao";
    }
  });
});

describe("account screen profile photo (ios, AV-AC4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAvatarUpload, {
      phase: "idle",
      busy: false,
      progress: null,
      failure: null,
      hasAvatar: true,
    });
    mockPrincipal = {
      origin: "https://api.example",
      userId: profile.id,
      epoch: 1,
    };
    mockAccountState = { status: "ready", database: {} };
  });

  test("puts a 프로필 사진 row in the 프로필 section ahead of the nickname row", async () => {
    const screen = await renderScreen();
    expect(screen.getByText("프로필 사진")).toBeTruthy();
    expect(screen.getByTestId("profile-photo-row-menu")).toBeTruthy();
    expect(screen.getByTestId("profile-photo-header-menu")).toBeTruthy();
  });

  test.each(["profile-photo-header-menu", "profile-photo-row-menu"])(
    "%s offers 사진 선택 and 기본 이미지로 wired to the upload hook",
    async (menu) => {
      const screen = await renderScreen();
      await fireEvent.press(screen.getByTestId(`${menu}-action-select`));
      expect(mockAvatarUpload.selectPhoto).toHaveBeenCalledTimes(1);
      await fireEvent.press(screen.getByTestId(`${menu}-action-reset`));
      expect(mockAvatarUpload.resetToDefault).toHaveBeenCalledTimes(1);
    },
  );

  test("disables 기본 이미지로 in both menus when the account has no avatar", async () => {
    mockAvatarUpload.hasAvatar = false;
    const screen = await renderScreen();
    for (const menu of [
      "profile-photo-header-menu",
      "profile-photo-row-menu",
    ]) {
      expect(
        screen.getByTestId(`${menu}-action-reset`).props.accessibilityState,
      ).toEqual({ disabled: true });
      expect(
        screen.getByTestId(`${menu}-action-select`).props.accessibilityState,
      ).toEqual({ disabled: false });
    }
  });

  test("shows a progress indicator on the avatar and disables the controls while uploading", async () => {
    Object.assign(mockAvatarUpload, {
      phase: "uploading",
      busy: true,
      progress: 0.4,
    });
    const screen = await renderScreen();
    expect(screen.getByTestId("profile-photo-progress")).toBeTruthy();
    for (const menu of [
      "profile-photo-header-menu",
      "profile-photo-row-menu",
    ]) {
      for (const key of ["select", "reset"]) {
        expect(
          screen.getByTestId(`${menu}-action-${key}`).props.accessibilityState,
        ).toEqual({ disabled: true });
      }
    }
  });

  test("shows no progress indicator when idle", async () => {
    const screen = await renderScreen();
    expect(screen.queryByTestId("profile-photo-progress")).toBeNull();
  });

  test("a retryable failure shows its Korean reason with 다시 시도, which retries; 닫기 dismisses", async () => {
    mockAvatarUpload.phase = "failed";
    mockAvatarUpload.failure = {
      message: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
      retryable: true,
    };
    const screen = await renderScreen();
    expect(screen.getByTestId("profile-photo-failure-alert")).toBeTruthy();
    expect(
      screen.getByText("네트워크 연결을 확인한 뒤 다시 시도해 주세요."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(mockAvatarUpload.retry).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      screen.getByTestId("profile-photo-failure-alert-cancel"),
    );
    expect(mockAvatarUpload.dismissFailure).toHaveBeenCalledTimes(1);
  });

  test("a non-retryable failure is acknowledge-only (확인), with no 다시 시도", async () => {
    mockAvatarUpload.phase = "failed";
    mockAvatarUpload.failure = {
      message: "이 사진은 사용할 수 없습니다. 다른 사진을 선택해 주세요.",
      retryable: false,
    };
    const screen = await renderScreen();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "확인" }));
    expect(mockAvatarUpload.dismissFailure).toHaveBeenCalledTimes(1);
  });

  test("renders no failure alert when there is no failure", async () => {
    const screen = await renderScreen();
    expect(screen.queryByTestId("profile-photo-failure-alert")).toBeNull();
  });
});
