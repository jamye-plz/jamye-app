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

type FileSystemModule = Readonly<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>;

/** Returns the full `<ListItem ...>` opening-tag source for the row whose
 * `testID` matches, regardless of attribute order -- used to check that a
 * `modifiers` prop sits on the *same* row rather than merely appearing
 * somewhere in the file. */
function extractListItemOpenTag(source: string, testId: string): string {
  const marker = `testID="${testId}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`fixture error: testID not found in source: ${testId}`);
  }
  const tagStart = source.lastIndexOf("<ListItem", markerIndex);
  const tagEnd = source.indexOf(">", markerIndex);
  return source.slice(tagStart, tagEnd + 1);
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

  test("A11YF-AC3: the push and preview switches carry Korean accessibility names", async () => {
    setLifecycleValue({
      state: { installation: fakeInstallation(), status: "registered" },
    });
    const screen = await renderSection();
    expect(
      screen.getByTestId("push-notifications-switch").props.accessibilityLabel,
    ).toBe("푸시 알림");
    expect(
      screen.getByTestId("message-preview-switch").props.accessibilityLabel,
    ).toBe("메시지 미리보기");
  });

  test("A11YF-AC3: rows without their own action strip the vendor-forced button trait (@expo/ui's iOS ListItem always wraps a SwiftUI Button)", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/features/notifications/ui/notification-settings-section.ios.tsx`,
      "utf8",
    );
    expect(source).toContain("accessibilityRemoveTraits");
    for (const rowTestId of [
      "push-notifications-row",
      "push-permission-denied-row",
      "message-preview-row",
    ]) {
      expect(extractListItemOpenTag(source, rowTestId)).toMatch(
        /accessibilityRemoveTraits\(\s*\[\s*["']isButton["']\s*\]\s*\)/,
      );
    }
    // "open-settings-row" has a real `onPress` and should keep reading as a button.
    expect(extractListItemOpenTag(source, "open-settings-row")).not.toMatch(
      /accessibilityRemoveTraits/,
    );
  });
});
