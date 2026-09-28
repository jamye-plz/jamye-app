import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";

import { DeveloperSection } from "@/features/account/ui/developer-section";

let mockAccountState: unknown = { status: "ready", database: {} };
const mockRetry = jest.fn();
let mockPushState: unknown = { status: "deleted" };
let mockExpoToken: string | null = null;

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
    expoToken: mockExpoToken,
    previewEnabled: false,
    setMessagePreview: jest.fn(),
    state: mockPushState,
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
jest.mock("@expo/ui/swift-ui", () => {
  const { Text: RNText, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Section({ children, title }: MockChildren & { title?: string }) {
    return (
      <View testID="section">
        {title ? <RNText>{title}</RNText> : null}
        {children}
      </View>
    );
  }
  function Text({ children, testID }: MockChildren & { testID?: string }) {
    return <RNText testID={testID}>{children}</RNText>;
  }
  return { Section, Text };
});

async function renderSection() {
  return render(<DeveloperSection />);
}

describe("developer section (ios)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountState = { status: "ready", database: {} };
    mockPushState = { status: "deleted" };
    mockExpoToken = null;
  });

  test("shows the section title and connection diagnostics (A3)", async () => {
    const screen = await renderSection();
    expect(screen.getByText("개발자")).toBeTruthy();
    expect(screen.getByTestId("connection-diagnostics")).toBeTruthy();
  });

  test("shows the storage status and no retry row when ready", async () => {
    const screen = await renderSection();
    expect(screen.getByText("로컬 계정 저장소 준비됨")).toBeTruthy();
    expect(screen.queryByTestId("dev-storage-retry-row")).toBeNull();
  });

  test("shows a retry row on a storage error and calls retry", async () => {
    mockAccountState = { error: new Error("x"), status: "error" };
    const screen = await renderSection();
    expect(
      screen.getByText(
        "로컬 계정 저장소를 열 수 없습니다. 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("dev-storage-retry-row"));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  test("masks the current expo token", async () => {
    mockExpoToken = "ExponentPushToken[abcdefgh12345]";
    const screen = await renderSection();
    expect(screen.queryByText("ExponentPushToken[abcdefgh12345]")).toBeNull();
    expect(screen.getByText(/…/)).toBeTruthy();
  });

  test("fully masks a short token instead of leaking most of it", async () => {
    mockExpoToken = "short";
    const screen = await renderSection();
    expect(screen.getByText("••••")).toBeTruthy();
  });

  test("shows 없음 when there is no token yet", async () => {
    const screen = await renderSection();
    expect(screen.getByText("없음")).toBeTruthy();
  });

  test.each([
    [{ status: "idle" } as const, "알림 상태 확인 중…"],
    [{ status: "checking" } as const, "알림 상태 확인 중…"],
    [{ status: "registering" } as const, "푸시 알림 등록 중…"],
    [{ status: "registered" } as const, "등록됨"],
    [{ status: "rotating" } as const, "토큰 갱신 중…"],
    [{ status: "stale" } as const, "서버와 재동기화 중…"],
    [
      { message: "x", status: "stale_unrecoverable" } as const,
      "동기화 실패 — 다시 로그인하거나 나중에 다시 시도해 주세요.",
    ],
    [{ status: "deleting" } as const, "알림 해제 중…"],
    [{ status: "deleted" } as const, "사용 안 함"],
    [
      {
        message: "x",
        reason: "permission_denied",
        status: "disabled",
      } as const,
      "권한 거부됨 — 설정 앱 > 알림에서 권한을 허용해 주세요.",
    ],
    [
      {
        message: "x",
        reason: "missing_project_id",
        status: "disabled",
      } as const,
      "프로젝트 ID 없음 — 앱 설정이 완료되지 않았습니다.",
    ],
    [
      {
        message: "x",
        reason: "not_physical_device",
        status: "disabled",
      } as const,
      "이 기기(시뮬레이터)에서는 사용할 수 없습니다.",
    ],
    [
      { message: "boom", status: "error" } as const,
      "오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    ],
  ])("renders the raw push diagnostic copy for %o", async (state, expected) => {
    mockPushState = state;
    const screen = await renderSection();
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
