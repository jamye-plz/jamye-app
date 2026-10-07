import { act, fireEvent, render, within } from "@testing-library/react-native";
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

// r2-18 / 기기 결함 9 regression: `Pressable` doesn't forward `onPress` as a
// literal prop onto its underlying host node, so RNTL's
// `getByTestId(...).props.onPress` can never observe what the screen passed
// in. Spy on the mocked `ListItem` instead and record what it actually
// received -- same shape as the HeaderActions spy in
// tests/features/topics/ui/topic-detail-screen.test.tsx, but requiring the
// manual mock file directly (not `jest.requireActual("@expo/ui")`, which
// would bypass the manual mock entirely and return the unusable real native
// module).
const mockListItemCalls: { testID?: string; onPress?: unknown }[] = [];
jest.mock("@expo/ui", () => {
  const actual = jest.requireActual<typeof import("../../__mocks__/@expo/ui")>(
    "../../__mocks__/@expo/ui",
  );
  return {
    ...actual,
    ListItem: (props: Parameters<typeof actual.ListItem>[0]) => {
      mockListItemCalls.push({ testID: props.testID, onPress: props.onPress });
      return <actual.ListItem {...props} />;
    },
  };
});

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
    updateNickname: jest.fn(),
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
          {props.cancelLabel ? (
            <Pressable
              accessibilityLabel={props.cancelLabel}
              accessibilityRole="button"
              onPress={props.onDismiss}
              testID={`${props.testID}-cancel`}
            />
          ) : null}
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

// Returns the `onPress` from the most recent render of the `ListItem` with
// this `testID` (per the spy above), so tests can see the same prop value
// the native side would have received -- not what the Pressable host node's
// `.props` happens to expose.
function lastListItemOnPress(testID: string): unknown {
  return mockListItemCalls.filter((call) => call.testID === testID).at(-1)
    ?.onPress;
}

describe("account screen (android)", () => {
  const originalDev = __DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    mockListItemCalls.length = 0;
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

  // task-app-device fix1: a blocked/error delete result surfaces as a
  // single-button acknowledge Material dialog, not an inline row caption --
  // `getAllByText` staying at 1 proves the inline caption is gone.
  test("shows a blocked failure alert (not an inline message) when the account can't be deleted yet, and 확인 dismisses it", async () => {
    mockDeleteAccount.mockResolvedValue({ status: "blocked" });
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId("delete-account-row"));
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
    await fireEvent.press(screen.getByTestId("delete-account-row"));
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

  test("renders nothing without a validated principal", async () => {
    mockPrincipal = null;
    const screen = await renderScreen();
    expect(screen.toJSON()).toBeNull();
  });

  // Regression for r2-18 / 기기 결함 9: the universal `ListItem` (Android)
  // swaps its Compose `modifiers` prop between an array and `undefined`
  // depending on whether `onPress` is defined, and `undefined` fails the
  // native prop cast. `onPress` must stay a defined function throughout the
  // in-flight state, with the guard living inside the handler.
  test("keeps the logout row's onPress defined while logging out and ignores presses until it finishes", async () => {
    let resolveDisable: (() => void) | undefined;
    mockPushDisable.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDisable = resolve;
        }),
    );
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId("logout-row"));
    await fireEvent.press(screen.getByTestId("logout-confirm-alert-confirm"));

    // Still in flight: the mocked ListItem must have received a defined
    // onPress, never `undefined` (checked on what it actually received, not
    // on the Pressable host node's props -- see the spy above).
    expect(typeof lastListItemOnPress("logout-row")).toBe("function");
    // Pressing again while in flight must not reopen the confirm alert or
    // log out a second time.
    await fireEvent.press(screen.getByTestId("logout-row"));
    expect(screen.queryByTestId("logout-confirm-alert-confirm")).toBeNull();
    expect(mockLogout).not.toHaveBeenCalled();

    resolveDisable?.();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  test("keeps the delete-account row's onPress defined while deleting and ignores presses until it finishes", async () => {
    let resolveDelete: (() => void) | undefined;
    mockDeleteAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = () => resolve({ status: "ok" });
        }),
    );
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId("delete-account-row"));
    await fireEvent.press(screen.getByTestId("delete-confirm-alert-confirm"));

    expect(typeof lastListItemOnPress("delete-account-row")).toBe("function");
    await fireEvent.press(screen.getByTestId("delete-account-row"));
    expect(screen.queryByTestId("delete-confirm-alert-confirm")).toBeNull();
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);

    resolveDelete?.();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  // U3/U7/AC5: provider label and delete-confirm copy for a (defensive-only,
  // D16: Apple never actually signs in on Android) Apple profile. `profile`
  // is a module-level fixture the mocked useSession closes over, so the
  // provider is mutated in place and restored in `finally`.
  test("Apple 계정(방어적 케이스): 라벨은 'Apple 계정으로 로그인됨'이고 삭제 확인 문구는 재인증 안내를 포함한다", async () => {
    profile.provider = "apple";
    try {
      const screen = await renderScreen();
      expect(screen.getByText("Apple 계정으로 로그인됨")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("delete-account-row"));
      const alert = screen.getByTestId("delete-confirm-alert");
      expect(
        within(alert).getByText(
          "계정을 삭제할까요? 30일 안에 같은 계정으로 다시 로그인하면 복구할 수 있고, 30일이 지나면 되돌릴 수 없습니다. 삭제하려면 Apple 인증을 한 번 더 진행합니다.",
        ),
      ).toBeTruthy();
    } finally {
      profile.provider = "google";
    }
  });
});

describe("account screen profile photo (android, AV-AC4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListItemCalls.length = 0;
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

  test("puts a 프로필 사진 row under the 프로필 subheader, before 닉네임", async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId("profile-photo-row")).toBeTruthy();
    expect(screen.getByText("프로필 사진")).toBeTruthy();
    expect(screen.getByTestId("profile-photo-row-menu")).toBeTruthy();
  });

  test("the row's onPress stays a defined function even while uploading (LogBox PropSetException guard)", async () => {
    mockAvatarUpload.busy = true;
    await renderScreen();
    expect(typeof lastListItemOnPress("profile-photo-row")).toBe("function");
  });

  test("tapping the header avatar or the row opens the same menu (expanded=true)", async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId("profile-photo-row-menu").props.expanded).toBe(
      false,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "프로필 사진 변경" }),
    );
    expect(screen.getByTestId("profile-photo-row-menu").props.expanded).toBe(
      true,
    );
  });

  test("the row opens the menu on press", async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId("profile-photo-row"));
    expect(screen.getByTestId("profile-photo-row-menu").props.expanded).toBe(
      true,
    );
  });

  test("a busy upload does not open the menu from the avatar or the row", async () => {
    mockAvatarUpload.busy = true;
    mockAvatarUpload.phase = "uploading";
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId("profile-photo-row"));
    expect(screen.getByTestId("profile-photo-row-menu").props.expanded).toBe(
      false,
    );
  });

  test("menu actions are wired to the upload hook and disable per state", async () => {
    mockAvatarUpload.hasAvatar = false;
    const screen = await renderScreen();
    await fireEvent.press(
      screen.getByTestId("profile-photo-row-menu-action-select"),
    );
    expect(mockAvatarUpload.selectPhoto).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("profile-photo-row-menu-action-reset").props
        .accessibilityState,
    ).toEqual({ disabled: true });
  });

  test("shows a progress indicator on the avatar and disables both actions while uploading", async () => {
    Object.assign(mockAvatarUpload, {
      phase: "uploading",
      busy: true,
      progress: 0.4,
    });
    const screen = await renderScreen();
    expect(screen.getByTestId("profile-photo-progress")).toBeTruthy();
    for (const key of ["select", "reset"]) {
      expect(
        screen.getByTestId(`profile-photo-row-menu-action-${key}`).props
          .accessibilityState,
      ).toEqual({ disabled: true });
    }
  });

  test("a retryable failure shows the Korean reason with 다시 시도", async () => {
    mockAvatarUpload.phase = "failed";
    mockAvatarUpload.failure = {
      message:
        "사진 저장소를 잠시 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      retryable: true,
    };
    const screen = await renderScreen();
    expect(
      screen.getByText(
        "사진 저장소를 잠시 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(mockAvatarUpload.retry).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      screen.getByTestId("profile-photo-failure-alert-cancel"),
    );
    expect(mockAvatarUpload.dismissFailure).toHaveBeenCalledTimes(1);
  });
});
