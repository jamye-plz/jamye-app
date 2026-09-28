import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { Linking } from "react-native";

import type { PushLifecycleContextValue } from "@/features/notifications/model/push-lifecycle-provider";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import type { PushInstallation } from "@/features/notifications/model/push-lifecycle";
import { NotificationSettingsSection } from "@/features/notifications/ui/notification-settings-section";

jest.mock("@/features/notifications/model/push-lifecycle-provider", () => ({
  usePushLifecycle: jest.fn(),
}));
jest.mock("@expo/ui/swift-ui", () => {
  const { Text: RNText, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
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
  return { Section, Text };
});

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
  return render(<NotificationSettingsSection />);
}

describe("notification settings section (ios)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLifecycleValue();
  });

  test("shows only the toggle state for a registered installation -- no raw diagnostic text (A1: '토글 상태만')", async () => {
    setLifecycleValue({
      state: { installation: fakeInstallation(), status: "registered" },
    });
    const screen = await renderSection();
    expect(screen.getByTestId("push-notifications-switch").props.value).toBe(
      true,
    );
    expect(screen.queryByText("등록됨")).toBeNull();
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

  test("shows the footer help text", async () => {
    const screen = await renderSection();
    expect(screen.getByText("알림에 메시지 내용을 보여 줍니다.")).toBeTruthy();
  });

  test("shows the permission-denied guidance and opens system settings (A3)", async () => {
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

  test("hides the permission-denied guidance otherwise", async () => {
    const screen = await renderSection();
    expect(screen.queryByText("설정에서 알림을 허용해 주세요.")).toBeNull();
    expect(screen.queryByText("설정 열기")).toBeNull();
  });
});
