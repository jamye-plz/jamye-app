import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { PushLifecycleContextValue } from "@/features/notifications/model/push-lifecycle-provider";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import type { PushInstallation } from "@/features/notifications/model/push-lifecycle";
import { NotificationSettingsSection } from "@/features/notifications/ui/notification-settings-section";

jest.mock("@/features/notifications/model/push-lifecycle-provider", () => ({
  usePushLifecycle: jest.fn(),
}));
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

const mockUsePushLifecycle = usePushLifecycle as jest.MockedFunction<
  typeof usePushLifecycle
>;
const mockEnable = jest.fn();
const mockDisable = jest.fn();
const mockSetMessagePreview = jest.fn();

function fakeInstallation(
  overrides: Partial<PushInstallation> = {},
): PushInstallation {
  return {
    disabledAt: null,
    environment: "development",
    installationId: "device-1",
    lastSeenAt: "2024-01-01T00:00:00Z",
    messagePreviewEnabled: false,
    platform: "ios",
    provider: "expo",
    ...overrides,
  };
}

function setLifecycleValue(overrides: Partial<PushLifecycleContextValue> = {}) {
  mockUsePushLifecycle.mockReturnValue({
    disable: mockDisable,
    enable: mockEnable,
    expoToken: null,
    previewEnabled: false,
    setMessagePreview: mockSetMessagePreview,
    state: { status: "deleted" },
    ...overrides,
  });
}

async function renderSection() {
  return render(
    <AppThemeProvider>
      <NotificationSettingsSection />
    </AppThemeProvider>,
  );
}

describe("notification settings section", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLifecycleValue();
  });

  test("shows the registered diagnostic and an enabled push switch", async () => {
    setLifecycleValue({
      state: { installation: fakeInstallation(), status: "registered" },
    });
    const screen = await renderSection();
    expect(screen.getByText("등록됨")).toBeTruthy();
    expect(screen.getByTestId("push-notifications-switch").props.value).toBe(
      true,
    );
  });

  test("shows Korean permission-denied guidance instead of a silent no-op", async () => {
    setLifecycleValue({
      state: {
        message: "denied",
        reason: "permission_denied",
        status: "disabled",
      },
    });
    const screen = await renderSection();
    expect(screen.getByText(/권한 거부됨/)).toBeTruthy();
    expect(screen.getByText(/설정 앱/)).toBeTruthy();
  });

  test("shows a missing project id diagnostic", async () => {
    setLifecycleValue({
      state: {
        message: "x",
        reason: "missing_project_id",
        status: "disabled",
      },
    });
    const screen = await renderSection();
    expect(screen.getByText(/프로젝트 ID 없음/)).toBeTruthy();
  });

  test("shows a non-physical-device (simulator) diagnostic", async () => {
    setLifecycleValue({
      state: {
        message: "x",
        reason: "not_physical_device",
        status: "disabled",
      },
    });
    const screen = await renderSection();
    expect(screen.getByText(/시뮬레이터/)).toBeTruthy();
  });

  test("shows a stale re-sync diagnostic", async () => {
    setLifecycleValue({
      state: { installation: fakeInstallation(), status: "stale" },
    });
    const screen = await renderSection();
    expect(screen.getByText(/재동기화/)).toBeTruthy();
  });

  test("calls enable when the push switch is turned on", async () => {
    const screen = await renderSection();
    fireEvent(
      screen.getByTestId("push-notifications-switch"),
      "valueChange",
      true,
    );
    expect(mockEnable).toHaveBeenCalledTimes(1);
  });

  test("calls disable when the push switch is turned off", async () => {
    setLifecycleValue({
      state: { installation: fakeInstallation(), status: "registered" },
    });
    const screen = await renderSection();
    fireEvent(
      screen.getByTestId("push-notifications-switch"),
      "valueChange",
      false,
    );
    expect(mockDisable).toHaveBeenCalledTimes(1);
  });

  test("disables the preview switch while push is off", async () => {
    const screen = await renderSection();
    expect(screen.getByTestId("message-preview-switch").props.disabled).toBe(
      true,
    );
  });

  test("enables the preview switch once push is registered", async () => {
    setLifecycleValue({
      state: { installation: fakeInstallation(), status: "registered" },
    });
    const screen = await renderSection();
    expect(screen.getByTestId("message-preview-switch").props.disabled).toBe(
      false,
    );
  });

  test("calls setMessagePreview when the preview switch is toggled", async () => {
    setLifecycleValue({
      state: { installation: fakeInstallation(), status: "registered" },
    });
    const screen = await renderSection();
    fireEvent(
      screen.getByTestId("message-preview-switch"),
      "valueChange",
      true,
    );
    expect(mockSetMessagePreview).toHaveBeenCalledWith(true);
  });

  test("masks the current expo token for support instead of showing it raw", async () => {
    setLifecycleValue({ expoToken: "ExponentPushToken[abcdefgh12345]" });
    const screen = await renderSection();
    expect(screen.queryByText("ExponentPushToken[abcdefgh12345]")).toBeNull();
    expect(screen.getByText(/…/)).toBeTruthy();
  });

  test.each([
    [{ status: "idle" } as const, /알림 상태 확인 중/],
    [{ status: "checking" } as const, /알림 상태 확인 중/],
    [{ status: "registering" } as const, /푸시 알림 등록 중/],
    [
      { installation: fakeInstallation(), status: "rotating" } as const,
      /토큰 갱신 중/,
    ],
    [
      {
        installation: fakeInstallation(),
        message: "동기화 실패",
        status: "stale_unrecoverable",
      } as const,
      /동기화 실패/,
    ],
    [
      { installation: fakeInstallation(), status: "deleting" } as const,
      /알림 해제 중/,
    ],
    [{ status: "deleted" } as const, /사용 안 함/],
    [{ message: "boom", status: "error" } as const, /오류가 발생했습니다/],
  ])(
    "renders Korean diagnostic copy for lifecycle state %o",
    async (state, expected) => {
      setLifecycleValue({ state });
      const screen = await renderSection();
      expect(screen.getByText(expected)).toBeTruthy();
    },
  );

  test("fully masks a short token instead of leaking most of it", async () => {
    setLifecycleValue({ expoToken: "short" });
    const screen = await renderSection();
    expect(screen.getByText("••••")).toBeTruthy();
  });

  test("shows 없음 when there is no token yet", async () => {
    const screen = await renderSection();
    expect(screen.getByText("없음")).toBeTruthy();
  });
});
