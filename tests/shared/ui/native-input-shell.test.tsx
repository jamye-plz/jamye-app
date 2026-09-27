import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";

import { NativeInputSheet } from "@/shared/ui/native-input-sheet";
import {
  isNativeInputShellSubmitDisabled,
  NativeInputShellStatusText,
} from "@/shared/ui/native-input-shell.shared";
import type { NativeInputShellProps } from "@/shared/ui/native-input-shell.types";

jest.mock("expo-router", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function ToolbarButton(
    props: Readonly<{
      accessibilityLabel?: string;
      children?: ReactNode;
      disabled?: boolean;
      onPress?: () => void;
      variant?: string;
    }>,
  ) {
    return (
      <Pressable
        accessibilityLabel={props.accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(props.disabled) }}
        disabled={props.disabled}
        onPress={props.onPress}
      >
        <Text>{props.children}</Text>
      </Pressable>
    );
  }
  function Toolbar({
    children,
  }: Readonly<{ children?: ReactNode; placement?: string }>) {
    return <View>{children}</View>;
  }
  Toolbar.Button = ToolbarButton;
  function Screen(
    props: Readonly<{ options?: { headerShown?: boolean; title?: string } }>,
  ) {
    return (
      <View
        accessibilityLabel={props.options?.title}
        {...{ options: props.options }}
        testID="screen-options"
      />
    );
  }
  return { Stack: { Screen, Toolbar } };
});

jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function Host(props: Readonly<{ children?: ReactNode; testID?: string }>) {
    return <View testID={props.testID}>{props.children}</View>;
  }
  return { Host };
});

export const mockIosNativeStates: { value: string; set: jest.Mock }[] = [];

jest.mock("@expo/ui/swift-ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const {
    Text: RNText,
    TextInput,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Form({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  function Section({
    children,
    footer,
  }: MockChildren & { footer?: ReactNode }) {
    return (
      <View>
        {children}
        {footer}
      </View>
    );
  }
  type MockObservableState = {
    value: string;
    get: () => string;
    set: jest.Mock;
  };
  function useNativeState(initial: string): MockObservableState {
    const ref = React.useRef<MockObservableState | null>(null);
    if (!ref.current) {
      const state: MockObservableState = {
        value: initial,
        get: () => state.value,
        set: jest.fn((next: string) => {
          state.value = next;
        }),
      };
      ref.current = state;
      mockIosNativeStates.push(state);
    }
    return ref.current;
  }
  function TextField(
    props: Readonly<{
      autoFocus?: boolean;
      modifiers?: { $type?: string; value?: boolean }[];
      onTextChange?: (value: string) => void;
      placeholder?: string;
      text?: MockObservableState;
    }>,
  ) {
    const isDisabled = props.modifiers?.some(
      (modifier) => modifier.$type === "disabled" && modifier.value,
    );
    return (
      <TextInput
        autoFocus={props.autoFocus}
        defaultValue={props.text?.value}
        editable={!isDisabled}
        onChangeText={props.onTextChange}
        placeholder={props.placeholder}
        testID="text-field"
      />
    );
  }
  function Text({ children }: MockChildren) {
    return <RNText>{children}</RNText>;
  }
  return { Form, Section, Text, TextField, useNativeState };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  disabled: (value: boolean) => ({ $type: "disabled", value }),
}));

function baseProps(overrides: Partial<NativeInputShellProps> = {}): {
  onCancel: jest.Mock;
  onChangeValue: jest.Mock;
  onSubmit: jest.Mock;
  props: NativeInputShellProps;
} {
  const onCancel = jest.fn();
  const onChangeValue = jest.fn();
  const onSubmit = jest.fn();
  const props: NativeInputShellProps = {
    onCancel,
    onChangeValue,
    onSubmit,
    submitLabel: "만들기",
    title: "새 그룹",
    value: "",
    ...overrides,
  };
  return { onCancel, onChangeValue, onSubmit, props };
}

describe("NativeInputShell shared fallback helpers", () => {
  test("submit is disabled when either the screen or submit action is blocked", () => {
    expect(isNativeInputShellSubmitDisabled(false, false)).toBe(false);
    expect(isNativeInputShellSubmitDisabled(true, false)).toBe(true);
    expect(isNativeInputShellSubmitDisabled(false, true)).toBe(true);
  });

  test("status text keeps the error-over-helper priority", async () => {
    const screen = await render(
      <NativeInputShellStatusText
        errorText="형식이 올바르지 않아요"
        helperText="그룹 이름을 정해주세요"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "형식이 올바르지 않아요",
    );
    expect(screen.queryByText("그룹 이름을 정해주세요")).toBeNull();
  });
});

describe("NativeInputSheet (iOS)", () => {
  test("취소/submit toolbar actions call the right handler; typing forwards to onChangeValue", async () => {
    const { onCancel, onChangeValue, onSubmit, props } = baseProps();
    const screen = await render(<NativeInputSheet {...props} />);
    expect(screen.getByTestId("screen-options").props.accessibilityLabel).toBe(
      "새 그룹",
    );
    await fireEvent.press(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByTestId("text-field"), "우리 그룹");
    expect(onChangeValue).toHaveBeenCalledWith("우리 그룹");
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("busy disables the field and both toolbar actions", async () => {
    const { onSubmit, props } = baseProps({ busy: true });
    const screen = await render(<NativeInputSheet {...props} />);
    expect(
      screen.getByRole("button", { name: "만들기" }).props.accessibilityState,
    ).toEqual({ disabled: true });
    expect(
      screen.getByRole("button", { name: "취소" }).props.accessibilityState,
    ).toEqual({ disabled: true });
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("text-field").props.editable).toBe(false);
  });

  test("submitDisabled alone disables submit without disabling the field", async () => {
    const { props } = baseProps({ submitDisabled: true });
    const screen = await render(<NativeInputSheet {...props} />);
    expect(
      screen.getByRole("button", { name: "만들기" }).props.accessibilityState,
    ).toEqual({ disabled: true });
    expect(screen.getByTestId("text-field").props.editable).toBe(true);
  });

  test("shows the error text over the helper text in the section footer", async () => {
    const { props } = baseProps({
      errorText: "이름을 입력해주세요",
      helperText: "그룹 이름을 정해주세요",
    });
    const screen = await render(<NativeInputSheet {...props} />);
    expect(screen.getByText("이름을 입력해주세요")).toBeTruthy();
    expect(screen.queryByText("그룹 이름을 정해주세요")).toBeNull();
  });

  test("with no error or helper text, the footer is empty", async () => {
    const { props } = baseProps();
    const screen = await render(<NativeInputSheet {...props} />);
    expect(screen.getByTestId("text-field")).toBeTruthy();
  });

  test("a later initialValue (e.g. a pending-invite code consumed on focus) is pushed into the native field state", async () => {
    mockIosNativeStates.length = 0;
    const { props } = baseProps();
    const screen = await render(<NativeInputSheet {...props} />);
    expect(mockIosNativeStates).toHaveLength(1);
    expect(mockIosNativeStates[0]!.set).not.toHaveBeenCalled();
    await screen.rerender(
      <NativeInputSheet {...props} initialValue={"a".repeat(20)} />,
    );
    expect(mockIosNativeStates[0]!.set).toHaveBeenCalledWith("a".repeat(20));
  });
});

export const mockAndroidNativeStates: { value: string; set: jest.Mock }[] = [];

jest.mock("@expo/ui/jetpack-compose", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const {
    Pressable,
    Text: RNText,
    TextInput,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  type MockObservableState = {
    value: string;
    get: () => string;
    set: jest.Mock;
  };
  function useNativeState(initial: string): MockObservableState {
    const ref = React.useRef<MockObservableState | null>(null);
    if (!ref.current) {
      const state: MockObservableState = {
        value: initial,
        get: () => state.value,
        set: jest.fn((next: string) => {
          state.value = next;
        }),
      };
      ref.current = state;
      mockAndroidNativeStates.push(state);
    }
    return ref.current;
  }
  function Column({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  function Row({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  function Icon(props: Readonly<{ contentDescription?: string }>) {
    return (
      <View accessibilityLabel={props.contentDescription} testID="close-icon" />
    );
  }
  function IconButton(
    props: Readonly<{
      children?: ReactNode;
      enabled?: boolean;
      onClick?: () => void;
    }>,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: props.enabled === false }}
        disabled={props.enabled === false}
        onPress={props.onClick}
      >
        {props.children}
      </Pressable>
    );
  }
  function TextButton(
    props: Readonly<{
      children?: ReactNode;
      enabled?: boolean;
      onClick?: () => void;
    }>,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: props.enabled === false }}
        disabled={props.enabled === false}
        onPress={props.onClick}
      >
        {props.children}
      </Pressable>
    );
  }
  function OutlinedTextField(
    props: Readonly<{
      autoFocus?: boolean;
      children?: ReactNode;
      enabled?: boolean;
      isError?: boolean;
      onValueChange?: (value: string) => void;
      value?: { value: string };
    }>,
  ) {
    return (
      <View>
        <TextInput
          autoFocus={props.autoFocus}
          defaultValue={props.value?.value}
          editable={props.enabled !== false}
          onChangeText={props.onValueChange}
          testID="outlined-text-field"
        />
        {props.children}
      </View>
    );
  }
  const slot = () =>
    function MockSlot({ children }: MockChildren) {
      return <View>{children}</View>;
    };
  OutlinedTextField.Placeholder = slot();
  OutlinedTextField.SupportingText = slot();
  function Text({ children }: MockChildren) {
    return <RNText>{children}</RNText>;
  }
  return {
    Column,
    Icon,
    IconButton,
    OutlinedTextField,
    Row,
    Text,
    TextButton,
    useNativeState,
  };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  fillMaxWidth: () => ({ $type: "fillMaxWidth" }),
  paddingAll: (value: number) => ({ $type: "paddingAll", value }),
  weight: (value: number) => ({ $type: "weight", value }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 24 }),
}));

function loadAndroid() {
  return jest.requireActual<{
    NativeInputDialog: (props: NativeInputShellProps) => React.JSX.Element;
  }>("../../../src/shared/ui/native-input-dialog.android.tsx")
    .NativeInputDialog;
}

describe("NativeInputDialog (Android)", () => {
  test("replaces the stack header with its own top bar, inset below the status bar", async () => {
    const NativeInputDialog = loadAndroid();
    const { props } = baseProps({ title: "새 그룹" });
    const screen = await render(<NativeInputDialog {...props} />);
    // One app bar only (F4): the stack header would duplicate the dialog's.
    expect(screen.getByTestId("screen-options").props.options).toEqual({
      headerShown: false,
    });
    expect(screen.getByTestId("screen-options").parent?.props.style).toEqual(
      expect.objectContaining({ paddingTop: 24 }),
    );
  });

  test("the ✕ calls onCancel, the top action calls onSubmit, and typing forwards", async () => {
    const NativeInputDialog = loadAndroid();
    const { onCancel, onChangeValue, onSubmit, props } = baseProps({
      submitLabel: "가입",
      title: "초대 코드로 가입",
    });
    const screen = await render(<NativeInputDialog {...props} />);
    expect(screen.getByText("초대 코드로 가입")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("닫기"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(
      screen.getByTestId("outlined-text-field"),
      "ABCD1234",
    );
    expect(onChangeValue).toHaveBeenCalledWith("ABCD1234");
    await fireEvent.press(screen.getByText("가입"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("busy disables the field and both actions", async () => {
    const NativeInputDialog = loadAndroid();
    const { onSubmit, props } = baseProps({ busy: true });
    const screen = await render(<NativeInputDialog {...props} />);
    expect(screen.getByText("만들기").parent?.props.accessibilityState).toEqual(
      {
        disabled: true,
      },
    );
    await fireEvent.press(screen.getByText("만들기"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("outlined-text-field").props.editable).toBe(
      false,
    );
  });

  test("submitDisabled disables the submit action without disabling the field", async () => {
    const NativeInputDialog = loadAndroid();
    const { props } = baseProps({ submitDisabled: true });
    const screen = await render(<NativeInputDialog {...props} />);
    expect(screen.getByText("만들기").parent?.props.accessibilityState).toEqual(
      {
        disabled: true,
      },
    );
    expect(screen.getByTestId("outlined-text-field").props.editable).toBe(true);
  });

  test("shows the error text as the supporting text", async () => {
    const NativeInputDialog = loadAndroid();
    const { props } = baseProps({ errorText: "형식이 올바르지 않아요" });
    const screen = await render(<NativeInputDialog {...props} />);
    expect(screen.getByText("형식이 올바르지 않아요")).toBeTruthy();
  });

  test("falls back to the helper text when there is no error", async () => {
    const NativeInputDialog = loadAndroid();
    const { props } = baseProps({ helperText: "그룹 이름을 정해주세요" });
    const screen = await render(<NativeInputDialog {...props} />);
    expect(screen.getByText("그룹 이름을 정해주세요")).toBeTruthy();
  });

  test("a later initialValue (e.g. a pending-invite code consumed on focus) is pushed into the native field state", async () => {
    mockAndroidNativeStates.length = 0;
    const NativeInputDialog = loadAndroid();
    const { props } = baseProps();
    const screen = await render(<NativeInputDialog {...props} />);
    expect(mockAndroidNativeStates).toHaveLength(1);
    expect(mockAndroidNativeStates[0]!.set).not.toHaveBeenCalled();
    await screen.rerender(
      <NativeInputDialog {...props} initialValue={"b".repeat(20)} />,
    );
    expect(mockAndroidNativeStates[0]!.set).toHaveBeenCalledWith(
      "b".repeat(20),
    );
  });
});
