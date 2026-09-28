import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";

let mockAccountState: unknown = { status: "ready", database: {} };
const mockRetry = jest.fn();

jest.mock("@/core/providers/app-providers", () => ({
  useAccountScope: jest.fn(() => ({
    retry: mockRetry,
    state: mockAccountState,
  })),
}));
jest.mock("@/features/notifications/model/push-lifecycle-provider", () => ({
  usePushLifecycle: jest.fn(() => ({
    disable: jest.fn(),
    enable: jest.fn(),
    expoToken: "ExponentPushToken[abcdefgh12345]",
    previewEnabled: false,
    setMessagePreview: jest.fn(),
    state: { installation: {}, status: "registered" },
  })),
}));
jest.mock("@/features/home/ui/connection-diagnostics", () => {
  const { Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ConnectionDiagnostics: () => (
      <RNText testID="connection-diagnostics">진단</RNText>
    ),
  };
});
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

async function renderSection() {
  const { DeveloperSection } = jest.requireActual<
    typeof import("@/features/account/ui/developer-section.android")
  >("@/features/account/ui/developer-section.android");
  return render(
    <AppThemeProvider>
      <DeveloperSection />
    </AppThemeProvider>,
  );
}

describe("developer section (android)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountState = { status: "ready", database: {} };
  });

  test("shows the header, storage status, connection diagnostics, and masked token", async () => {
    const screen = await renderSection();
    expect(screen.getByTestId("developer-section-header")).toBeTruthy();
    expect(screen.getByText("로컬 계정 저장소 준비됨")).toBeTruthy();
    expect(screen.getByTestId("connection-diagnostics")).toBeTruthy();
    expect(screen.queryByText("ExponentPushToken[abcdefgh12345]")).toBeNull();
  });

  test("shows a retry row on a storage error and calls retry", async () => {
    mockAccountState = { error: new Error("x"), status: "error" };
    const screen = await renderSection();
    await fireEvent.press(screen.getByTestId("dev-storage-retry-row"));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});
