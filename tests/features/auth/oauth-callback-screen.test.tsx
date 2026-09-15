import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { OAuthCallbackScreen } from "@/features/auth/ui/oauth-callback-screen";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockReplace }),
}));

beforeEach(() => {
  mockReplace.mockClear();
});

test("explains the unverifiable login request as an empty state and offers a way back", async () => {
  const screen = await render(<OAuthCallbackScreen />);
  expect(screen.getByText("로그인 요청을 확인할 수 없습니다")).toBeTruthy();
  expect(
    screen.getByText("앱에서 새 로그인 요청을 시작해 주세요."),
  ).toBeTruthy();
  const button = screen.getByRole("button", {
    name: "로그인 화면으로 돌아가기",
  });
  expect(button).toBeEnabled();
  await fireEvent.press(button);
  expect(mockReplace).toHaveBeenCalledWith("/");
});

test("the return-to-login action stays reachable across repeated presses", async () => {
  const screen = await render(<OAuthCallbackScreen />);
  const button = screen.getByRole("button", {
    name: "로그인 화면으로 돌아가기",
  });
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(mockReplace).toHaveBeenCalledTimes(2);
});
