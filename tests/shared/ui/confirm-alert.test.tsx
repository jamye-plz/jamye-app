import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";

import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import type { ConfirmAlertProps } from "@/shared/ui/confirm-alert.types";

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

jest.mock("@expo/ui/jetpack-compose", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyView = View as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function AlertDialog(
    props: Readonly<{ children?: ReactNode; modifiers?: unknown[] }>,
  ) {
    return (
      <AnyView modifiers={props.modifiers} testID="alert-dialog">
        {props.children}
      </AnyView>
    );
  }
  const slot = () =>
    function MockSlot({ children }: MockChildren) {
      return <View>{children}</View>;
    };
  AlertDialog.Title = slot();
  AlertDialog.Text = slot();
  AlertDialog.ConfirmButton = slot();
  AlertDialog.DismissButton = slot();
  function TextButton(
    props: Readonly<{ children?: ReactNode; onClick?: () => void }>,
  ) {
    return (
      <Pressable accessibilityRole="button" onPress={props.onClick}>
        {props.children}
      </Pressable>
    );
  }
  function ComposeText(
    props: Readonly<{ children?: ReactNode; color?: string }>,
  ) {
    return <Text style={{ color: props.color }}>{props.children}</Text>;
  }
  return { AlertDialog, Text: ComposeText, TextButton };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  testID: (id: string) => ({ $type: "testID", id }),
}));

function loadAndroid() {
  return jest.requireActual<{
    ConfirmAlert: (props: ConfirmAlertProps) => React.JSX.Element | null;
  }>("../../../src/shared/ui/confirm-alert.android.tsx").ConfirmAlert;
}

describe("ConfirmAlert (iOS)", () => {
  test("renders title/message, defaults the cancel label, and routes confirm/dismiss", async () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const screen = await render(
      <ConfirmAlert
        confirmLabel="나가기"
        destructive
        isPresented
        message="정말 나가시겠어요?"
        onConfirm={onConfirm}
        onDismiss={onDismiss}
        testID="leave-alert"
        title="그룹 나가기"
      />,
    );
    expect(screen.getByText("그룹 나가기")).toBeTruthy();
    expect(screen.getByText("정말 나가시겠어요?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "취소" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    const confirmButton = screen.getByRole("button", { name: "나가기" });
    expect(confirmButton.props.accessibilityHint).toBe("destructive");
    await fireEvent.press(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("a non-destructive confirm has no destructive role and the message slot is skipped without a message", async () => {
    const screen = await render(
      <ConfirmAlert
        confirmLabel="확인"
        isPresented
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
        title="확인해주세요"
      />,
    );
    expect(
      screen.getByRole("button", { name: "확인" }).props.accessibilityHint,
    ).toBeUndefined();
  });

  test("renders nothing while not presented", async () => {
    const screen = await render(
      <ConfirmAlert
        confirmLabel="확인"
        isPresented={false}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
        title="제목"
      />,
    );
    expect(screen.queryByText("제목")).toBeNull();
  });

  // task-app-device fix1: the account-delete failure notice is a
  // single-button "확인"-only alert -- no cancel/dismiss button at all.
  test("acknowledge mode hides the cancel button, leaving only the confirm action", async () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const screen = await render(
      <ConfirmAlert
        acknowledge
        confirmLabel="확인"
        isPresented
        message="계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요."
        onConfirm={onConfirm}
        onDismiss={onDismiss}
        testID="failure-alert"
        title="계정 삭제"
      />,
    );
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "확인" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("ConfirmAlert (Android)", () => {
  test("renders an AlertDialog with title/message and routes confirm/dismiss", async () => {
    const AndroidConfirmAlert = loadAndroid();
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const screen = await render(
      <AndroidConfirmAlert
        confirmLabel="나가기"
        destructive
        isPresented
        message="정말 나가시겠어요?"
        onConfirm={onConfirm}
        onDismiss={onDismiss}
        testID="leave-alert"
        title="그룹 나가기"
      />,
    );
    expect(screen.getByTestId("alert-dialog").props.modifiers).toEqual([
      { $type: "testID", id: "leave-alert" },
    ]);
    expect(screen.getByText("그룹 나가기")).toBeTruthy();
    expect(screen.getByText("정말 나가시겠어요?")).toBeTruthy();
    await fireEvent.press(screen.getByText("취소"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText("나가기"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("renders nothing while not presented", async () => {
    const AndroidConfirmAlert = loadAndroid();
    const screen = await render(
      <AndroidConfirmAlert
        confirmLabel="확인"
        isPresented={false}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
        title="제목"
      />,
    );
    expect(screen.queryByText("제목")).toBeNull();
  });

  // task-app-device fix1: same single-button acknowledge mode, Android side
  // -- the AlertDialog.DismissButton slot is omitted entirely.
  test("acknowledge mode omits the DismissButton slot, leaving only the confirm action", async () => {
    const AndroidConfirmAlert = loadAndroid();
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const screen = await render(
      <AndroidConfirmAlert
        acknowledge
        confirmLabel="확인"
        isPresented
        message="계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요."
        onConfirm={onConfirm}
        onDismiss={onDismiss}
        testID="failure-alert"
        title="계정 삭제"
      />,
    );
    expect(screen.queryByText("취소")).toBeNull();
    await fireEvent.press(screen.getByText("확인"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
