import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";

import {
  StandardStateView,
  StandardStateViewErrorRow,
} from "@/shared/ui/standard-state-view";
import { supportsLiquidGlassButtons } from "@/shared/ui/standard-state-view.ios";
import type {
  StandardStateViewErrorRowProps,
  StandardStateViewProps,
} from "@/shared/ui/standard-state-view.types";

jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyPressable = Pressable as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  type MockChildren = Readonly<{ children?: ReactNode; testID?: string }>;
  function VStack({ children, testID }: MockChildren) {
    return <View testID={testID}>{children}</View>;
  }
  function ProgressView() {
    return <View testID="progress-view" />;
  }
  function ContentUnavailableView(
    props: Readonly<{
      description?: string;
      systemImage?: string;
      title?: string;
    }>,
  ) {
    return (
      <View accessibilityHint={props.systemImage} testID="content-unavailable">
        <Text accessibilityRole="header">{props.title}</Text>
        {props.description ? <Text>{props.description}</Text> : null}
      </View>
    );
  }
  function Button(
    props: Readonly<{
      label?: string;
      modifiers?: { style?: string }[];
      onPress?: () => void;
    }>,
  ) {
    return (
      <AnyPressable
        accessibilityLabel={props.label}
        accessibilityRole="button"
        modifiers={props.modifiers}
        onPress={props.onPress}
        testID={`button-${props.label}`}
      />
    );
  }
  return { Button, ContentUnavailableView, ProgressView, Text, VStack };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  buttonStyle: (style: string) => ({ $type: "buttonStyle", style }),
  fixedSize: (params: unknown) => ({ $type: "fixedSize", params }),
  frame: (params: unknown) => ({ $type: "frame", params }),
}));

jest.mock("@expo/ui/jetpack-compose", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyView = View as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  type MockChildren = Readonly<{ children?: ReactNode; modifiers?: unknown[] }>;
  function Column({ children, modifiers }: MockChildren) {
    return (
      <AnyView modifiers={modifiers} testID="column">
        {children}
      </AnyView>
    );
  }
  function LoadingIndicator() {
    return <View testID="loading-indicator" />;
  }
  function Icon(props: Readonly<{ source?: unknown }>) {
    return <AnyView source={props.source} testID="icon" />;
  }
  function FilledButton(
    props: Readonly<{ children?: ReactNode; onClick?: () => void }>,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={props.onClick}
        testID="filled-button"
      >
        {props.children}
      </Pressable>
    );
  }
  function OutlinedButton(
    props: Readonly<{ children?: ReactNode; onClick?: () => void }>,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={props.onClick}
        testID="outlined-button"
      >
        {props.children}
      </Pressable>
    );
  }
  function TextButton(
    props: Readonly<{ children?: ReactNode; onClick?: () => void }>,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={props.onClick}
        testID="text-button"
      >
        {props.children}
      </Pressable>
    );
  }
  return {
    Button: FilledButton,
    Column,
    Icon,
    LoadingIndicator,
    OutlinedButton,
    Text,
    TextButton,
  };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  fillMaxSize: () => ({ $type: "fillMaxSize" }),
  paddingAll: (all: number) => ({ $type: "paddingAll", all }),
  size: (width: number, height: number) => ({ $type: "size", height, width }),
  testID: (id: string) => ({ $type: "testID", id }),
}));

function loadAndroid() {
  return jest.requireActual<{
    StandardStateView: (props: StandardStateViewProps) => React.JSX.Element;
  }>("../../../src/shared/ui/standard-state-view.android.tsx")
    .StandardStateView;
}

describe("supportsLiquidGlassButtons", () => {
  test.each([
    ["26", true],
    ["27.1", true],
    [26, true],
    ["25.9", false],
    ["17.0", false],
    [undefined, false],
    ["not-a-version", false],
  ] as const)("version %p -> %p", (version, expected) => {
    expect(supportsLiquidGlassButtons(version)).toBe(expected);
  });
});

describe("StandardStateView (iOS)", () => {
  test("loading renders only a ProgressView", async () => {
    const screen = await render(
      <StandardStateView kind="loading" testID="state" />,
    );
    expect(screen.getByTestId("progress-view")).toBeTruthy();
    expect(screen.queryByTestId("content-unavailable")).toBeNull();
  });

  test("empty shows ContentUnavailableView plus primary/secondary actions with distinct emphasized styles", async () => {
    const primary = jest.fn();
    const secondary = jest.fn();
    const screen = await render(
      <StandardStateView
        actions={[
          { label: "새 그룹 만들기", onPress: primary, primary: true },
          { label: "초대 코드로 가입", onPress: secondary },
        ]}
        description="그룹에 참여해보세요"
        kind="empty"
        systemImage="emptyGroups"
        title="그룹이 없어요"
      />,
    );
    expect(screen.getByText("그룹이 없어요")).toBeTruthy();
    expect(screen.getByText("그룹에 참여해보세요")).toBeTruthy();
    expect(
      screen.getByTestId("content-unavailable").props.accessibilityHint,
    ).toBe("person.2");
    await fireEvent.press(screen.getByTestId("button-새 그룹 만들기"));
    expect(primary).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId("button-초대 코드로 가입"));
    expect(secondary).toHaveBeenCalledTimes(1);
    const primaryStyle = (
      screen.getByTestId("button-새 그룹 만들기").props.modifiers as {
        style: string;
      }[]
    )[0]!.style;
    const secondaryStyle = (
      screen.getByTestId("button-초대 코드로 가입").props.modifiers as {
        style: string;
      }[]
    )[0]!.style;
    expect(["glassProminent", "borderedProminent"]).toContain(primaryStyle);
    expect(["glass", "bordered"]).toContain(secondaryStyle);
    expect(primaryStyle).not.toBe(secondaryStyle);
  });

  test("error kind reuses ContentUnavailableView with a 다시 시도 action", async () => {
    const onRetry = jest.fn();
    const screen = await render(
      <StandardStateView
        actions={[{ label: "다시 시도", onPress: onRetry, primary: true }]}
        kind="error"
        systemImage="error"
        title="불러오지 못했어요"
      />,
    );
    expect(
      screen.getByTestId("content-unavailable").props.accessibilityHint,
    ).toBe("exclamationmark.triangle");
    await fireEvent.press(screen.getByTestId("button-다시 시도"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("StandardStateViewErrorRow (iOS)", () => {
  test("shows the message and a default 다시 시도 label that calls onRetry", async () => {
    const onRetry = jest.fn();
    const screen = await render(
      <StandardStateViewErrorRow
        message="더 불러오지 못했어요"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("더 불러오지 못했어요")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("a custom retryLabel overrides the default", async () => {
    const screen = await render(
      <StandardStateViewErrorRow
        message="실패"
        onRetry={jest.fn()}
        retryLabel="재시도"
      />,
    );
    expect(screen.getByRole("button", { name: "재시도" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });
});

describe("StandardStateView (Android)", () => {
  test("loading renders only a LoadingIndicator", async () => {
    const AndroidStandardStateView = loadAndroid();
    const screen = await render(
      <AndroidStandardStateView kind="loading" testID="state" />,
    );
    expect(screen.getByTestId("loading-indicator")).toBeTruthy();
    // Centered in whatever space the host gives it.
    expect(screen.getByTestId("column").props.modifiers).toEqual([
      { $type: "fillMaxSize" },
      { $type: "paddingAll", all: 24 },
      { $type: "testID", id: "state" },
    ]);
  });

  test("empty renders text and filled/outlined actions", async () => {
    const AndroidStandardStateView = loadAndroid();
    const primary = jest.fn();
    const secondary = jest.fn();
    const screen = await render(
      <AndroidStandardStateView
        actions={[
          { label: "새 그룹 만들기", onPress: primary, primary: true },
          { label: "초대 코드로 가입", onPress: secondary },
        ]}
        kind="empty"
        systemImage="emptyGroups"
        title="그룹이 없어요"
      />,
    );
    expect(screen.getByText("그룹이 없어요")).toBeTruthy();
    expect(screen.getByTestId("filled-button")).toBeTruthy();
    expect(screen.getByTestId("outlined-button")).toBeTruthy();
    await fireEvent.press(screen.getByText("새 그룹 만들기"));
    expect(primary).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText("초대 코드로 가입"));
    expect(secondary).toHaveBeenCalledTimes(1);
  });

  test("falls back to the error drawable for a symbol with no dedicated Android mapping", async () => {
    const AndroidStandardStateView = loadAndroid();
    const screen = await render(
      <AndroidStandardStateView
        kind="empty"
        systemImage="hashtag"
        title="태그 없음"
      />,
    );
    expect(screen.getByTestId("icon")).toBeTruthy();
  });
});

describe("StandardStateViewErrorRow (Android)", () => {
  // Shared sections (e.g. the topic gallery) import the row on every
  // platform; a missing Android export renders `undefined` and crashes.
  test("shows the message with a TextButton retry", async () => {
    const { StandardStateViewErrorRow: AndroidErrorRow } = jest.requireActual<{
      StandardStateViewErrorRow?: (
        props: StandardStateViewErrorRowProps,
      ) => React.JSX.Element;
    }>("../../../src/shared/ui/standard-state-view.android.tsx");
    expect(AndroidErrorRow).toBeDefined();
    const onRetry = jest.fn();
    const screen = await render(
      AndroidErrorRow ? (
        <AndroidErrorRow
          message="갤러리를 불러오지 못했습니다."
          onRetry={onRetry}
          testID="error-row"
        />
      ) : (
        <></>
      ),
    );
    expect(screen.getByText("갤러리를 불러오지 못했습니다.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("text-button"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText("다시 시도")).toBeTruthy();
  });
});
