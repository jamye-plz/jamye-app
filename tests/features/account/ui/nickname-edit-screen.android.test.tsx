import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

const mockBack = jest.fn();
const mockUpdateNickname = jest.fn();
let mockNickname = "기존닉네임";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));
jest.mock("@/core/providers/session-provider", () => ({
  useSession: jest.fn(() => ({
    state: { profile: { nickname: mockNickname } },
  })),
}));
jest.mock("@/features/account/model/use-account-lifecycle", () => ({
  useAccountLifecycle: jest.fn(() => ({
    deleteAccount: jest.fn(),
    updateNickname: mockUpdateNickname,
  })),
}));
jest.mock("@/shared/ui/native-input-dialog", () => {
  const { NativeInputShellMock } = jest.requireActual<
    typeof import("../../../support/native-input-shell-mock")
  >("../../../support/native-input-shell-mock");
  return { NativeInputDialog: NativeInputShellMock };
});

async function renderScreen() {
  const { NicknameEditScreen } = jest.requireActual<
    typeof import("@/features/account/ui/nickname-edit-screen.android")
  >("@/features/account/ui/nickname-edit-screen.android");
  return render(<NicknameEditScreen />);
}

describe("nickname edit screen (android)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNickname = "기존닉네임";
  });

  test("opens with the current nickname in the field (device regression: the native field only reads initialValue)", async () => {
    const screen = await renderScreen();
    // The shell mock exposes `initialValue` as the field's hint; the real
    // shells seed the native field from it and ignore `value`.
    expect(screen.getByLabelText("닉네임").props.accessibilityHint).toBe(
      "기존닉네임",
    );
  });

  test("shows the title", async () => {
    const screen = await renderScreen();
    expect(screen.getByText("닉네임 변경")).toBeTruthy();
  });

  test("saves a valid, changed nickname and closes on success", async () => {
    mockUpdateNickname.mockResolvedValue({
      profile: { nickname: "새닉네임" },
      status: "ok",
    });
    const screen = await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "새닉네임");
    await fireEvent.press(screen.getByLabelText("저장"));
    expect(mockUpdateNickname).toHaveBeenCalledWith("새닉네임");
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("shows the empty-value error", async () => {
    const screen = await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "   ");
    expect(screen.getByText("닉네임을 입력해 주세요.")).toBeTruthy();
  });

  test("cancels back without saving", async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText("취소"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateNickname).not.toHaveBeenCalled();
  });
});
