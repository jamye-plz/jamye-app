import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { NicknameEditScreen } from "@/features/account/ui/nickname-edit-screen";

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
jest.mock("@/shared/ui/native-input-sheet", () => {
  const { NativeInputShellMock } = jest.requireActual<
    typeof import("../../../support/native-input-shell-mock")
  >("../../../support/native-input-shell-mock");
  return { NativeInputSheet: NativeInputShellMock };
});

async function renderScreen() {
  return render(<NicknameEditScreen />);
}

describe("nickname edit screen (ios)", () => {
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

  test("shows the title and help text (A2)", async () => {
    const screen = await renderScreen();
    expect(screen.getByText("닉네임 변경")).toBeTruthy();
    expect(screen.getByText("그룹에서 보이는 이름입니다.")).toBeTruthy();
  });

  test("shows an error and blocks submit for an empty value", async () => {
    const screen = await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "   ");
    expect(screen.getByText("닉네임을 입력해 주세요.")).toBeTruthy();
    expect(screen.getByLabelText("저장")).toBeDisabled();
  });

  test("shows an error and blocks submit for a value over 64 characters", async () => {
    const screen = await renderScreen();
    await fireEvent.changeText(
      screen.getByLabelText("닉네임"),
      "가".repeat(65),
    );
    expect(
      screen.getByText("닉네임은 64자 이하로 입력해 주세요."),
    ).toBeTruthy();
    expect(screen.getByLabelText("저장")).toBeDisabled();
  });

  test("blocks submit while the value is unchanged", async () => {
    const screen = await renderScreen();
    expect(screen.getByLabelText("저장")).toBeDisabled();
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

  test("shows the generic error and stays open when the save fails", async () => {
    mockUpdateNickname.mockResolvedValue({ code: "boom", status: "error" });
    const screen = await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "새닉네임");
    await fireEvent.press(screen.getByLabelText("저장"));
    expect(
      screen.getByText(
        "닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("maps an 'invalid: too_long' lifecycle result back onto the field", async () => {
    mockUpdateNickname.mockResolvedValue({
      reason: "too_long",
      status: "invalid",
    });
    const screen = await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "새닉네임");
    await fireEvent.press(screen.getByLabelText("저장"));
    expect(
      screen.getByText("닉네임은 64자 이하로 입력해 주세요."),
    ).toBeTruthy();
  });

  test("prevents a duplicate submit while busy", async () => {
    let resolveSave: (value: {
      status: "ok";
      profile: { nickname: string };
    }) => void = () => undefined;
    mockUpdateNickname.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const screen = await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "새닉네임");
    await fireEvent.press(screen.getByLabelText("저장"));
    await fireEvent.press(screen.getByLabelText("저장"));
    expect(mockUpdateNickname).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveSave({ profile: { nickname: "새닉네임" }, status: "ok" });
      await Promise.resolve();
    });
  });

  test("cancels back without saving", async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText("취소"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateNickname).not.toHaveBeenCalled();
  });
});
