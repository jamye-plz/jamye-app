import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Linking } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { PushLifecycleContextValue } from "@/features/notifications/model/push-lifecycle-provider";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import type { PushInstallation } from "@/features/notifications/model/push-lifecycle";

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
    platform: "android",
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
  const { NotificationSettingsSection } = jest.requireActual<
    typeof import("@/features/notifications/ui/notification-settings-section.android")
  >("@/features/notifications/ui/notification-settings-section.android");
  return render(
    <AppThemeProvider>
      <NotificationSettingsSection />
    </AppThemeProvider>,
  );
}

describe("notification settings section (android)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLifecycleValue();
  });

  test("shows the subheader and the toggle state", async () => {
    setLifecycleValue({
      state: { installation: fakeInstallation(), status: "registered" },
    });
    const screen = await renderSection();
    expect(screen.getByTestId("notification-section-header")).toBeTruthy();
    expect(screen.getByTestId("push-notifications-switch").props.value).toBe(
      true,
    );
    expect(screen.queryByText("등록됨")).toBeNull();
  });

  test("calls enable/disable on toggle", async () => {
    const screen = await renderSection();
    fireEvent(
      screen.getByTestId("push-notifications-switch"),
      "valueChange",
      true,
    );
    expect(mockEnable).toHaveBeenCalledTimes(1);
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

  test("shows the permission-denied guidance and opens system settings", async () => {
    const openSettingsSpy = jest
      .spyOn(Linking, "openSettings")
      .mockResolvedValue();
    setLifecycleValue({
      state: {
        message: "denied",
        reason: "permission_denied",
        status: "disabled",
      },
    });
    const screen = await renderSection();
    expect(screen.getByText("설정에서 알림을 허용해 주세요.")).toBeTruthy();
    await fireEvent.press(screen.getByText("설정 열기"));
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    openSettingsSpy.mockRestore();
  });

  test("shows the footer help text", async () => {
    const screen = await renderSection();
    expect(screen.getByText("알림에 메시지 내용을 보여 줍니다.")).toBeTruthy();
  });
});
