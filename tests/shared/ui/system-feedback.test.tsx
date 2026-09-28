import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Pressable, Text as RNText } from "react-native";

import {
  SystemFeedbackHost,
  useSystemFeedback,
} from "@/shared/ui/system-feedback";
import type { SystemFeedbackOptions } from "@/shared/ui/system-feedback.types";

// The SwiftUI `Alert`/`Button`/`Spacer` used here come from
// `@expo/ui/swift-ui`, mocked the same way as `confirm-alert.test.tsx` (which
// exercises the identical upstream component).
jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Alert(
    props: Readonly<{
      children?: ReactNode;
      isPresented?: boolean;
      testID?: string;
      title?: string;
    }>,
  ) {
    // `require` (not `jest.requireMock`) returns the same "@expo/ui" mock
    // instance the component under test imports, so the Host context matches.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use ES import
    const hostGuard = require("@expo/ui") as {
      useMockHostGuard: (component: string) => void;
    };
    hostGuard.useMockHostGuard("Alert");
    if (!props.isPresented) return null;
    return (
      <View testID={props.testID ?? "alert"}>
        <Text accessibilityRole="header">{props.title}</Text>
        {props.children}
      </View>
    );
  }
  const slot = () =>
    function MockSlot({ children }: MockChildren) {
      return <View>{children}</View>;
    };
  Alert.Trigger = slot();
  Alert.Actions = slot();
  Alert.Message = slot();
  function Button(
    props: Readonly<{ label?: string; onPress?: () => void; role?: string }>,
  ) {
    return (
      <Pressable
        accessibilityHint={props.role}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        onPress={props.onPress}
      />
    );
  }
  function Spacer() {
    return <View testID="spacer" />;
  }
  function MockText({ children }: MockChildren) {
    return <Text>{children}</Text>;
  }
  return { Alert, Button, Spacer, Text: MockText };
});

function Screen({ notice }: Readonly<{ notice: SystemFeedbackOptions }>) {
  const { showNotice } = useSystemFeedback();
  return (
    <Pressable accessibilityRole="button" onPress={() => showNotice(notice)}>
      <RNText>열기</RNText>
    </Pressable>
  );
}

describe("useSystemFeedback (iOS)", () => {
  test("shows a single-button alert (확인) with the title and message, and dismisses on press", async () => {
    const screen = await render(
      <SystemFeedbackHost testID="feedback">
        <Screen
          notice={{
            message: "더 이상 접근할 수 없는 알림입니다.",
            title: "알림",
          }}
        />
      </SystemFeedbackHost>,
    );
    expect(screen.queryByTestId("feedback")).toBeNull();
    await fireEvent.press(screen.getByText("열기"));
    expect(screen.getByTestId("feedback")).toBeTruthy();
    expect(screen.getByText("알림")).toBeTruthy();
    expect(screen.getByText("더 이상 접근할 수 없는 알림입니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "확인" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "닫기" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "확인" }));
    expect(screen.queryByTestId("feedback")).toBeNull();
  });

  test("with an action, shows 닫기 and the action label; the action dismisses and runs onAction", async () => {
    const onAction = jest.fn();
    const screen = await render(
      <SystemFeedbackHost testID="feedback">
        <Screen
          notice={{
            actionLabel: "다시 시도",
            message: "알림을 열 수 없습니다.",
            onAction,
          }}
        />
      </SystemFeedbackHost>,
    );
    await fireEvent.press(screen.getByText("열기"));
    expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "확인" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("feedback")).toBeNull();
  });

  test("dismissing via 닫기 does not run onAction", async () => {
    const onAction = jest.fn();
    const screen = await render(
      <SystemFeedbackHost testID="feedback">
        <Screen
          notice={{
            actionLabel: "다시 시도",
            message: "알림을 열 수 없습니다.",
            onAction,
          }}
        />
      </SystemFeedbackHost>,
    );
    await fireEvent.press(screen.getByText("열기"));
    await fireEvent.press(screen.getByRole("button", { name: "닫기" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByTestId("feedback")).toBeNull();
  });

  test("useSystemFeedback throws outside a SystemFeedbackHost", async () => {
    function Bare() {
      useSystemFeedback();
      return null;
    }
    await expect(render(<Bare />)).rejects.toThrow(
      "useSystemFeedback must be used inside SystemFeedbackHost.",
    );
  });
});
