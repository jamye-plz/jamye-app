import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { OAuthCallbackScreen } from "@/features/auth/ui/oauth-callback-screen";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockReplace }),
}));
// Same stand-in as `tests/features/topics/ui/topics-screens.test.tsx`: this
// screen's own behavior is "pass the right props to StandardStateView and
// wire its action", not StandardStateView's own rendering (covered by
// `tests/shared/ui/standard-state-view.test.tsx`).
jest.mock("@/shared/ui/standard-state-view", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function StandardStateView(props: {
    kind: string;
    testID?: string;
    title?: string;
    description?: string;
    actions?: readonly { label: string; onPress: () => void }[];
  }) {
    return (
      <View testID={props.testID}>
        <Text accessibilityRole="header">{props.title}</Text>
        {props.description ? <Text>{props.description}</Text> : null}
        {(props.actions ?? []).map((action) => (
          <Pressable
            accessibilityLabel={action.label}
            accessibilityRole="button"
            key={action.label}
            onPress={action.onPress}
          >
            <Text>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return { StandardStateView };
});

beforeEach(() => {
  mockReplace.mockClear();
});

test("explains the unverifiable login request as a standard error state and offers a way back", async () => {
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
