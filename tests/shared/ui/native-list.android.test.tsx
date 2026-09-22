import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { Text } from "react-native";
import type { NativeListProps } from "@/shared/ui/native-list.types";

jest.mock("@expo/ui/jetpack-compose", () => {
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockBoxProps = Readonly<{
    children?: ReactNode;
    isRefreshing?: boolean;
    modifiers?: unknown[];
    onRefresh?: () => void;
  }>;
  function PullToRefreshBox(props: MockBoxProps) {
    const refresh = { onRefresh: props.onRefresh } as object;
    return (
      <View
        {...refresh}
        accessibilityState={{ busy: props.isRefreshing }}
        testID="pull-to-refresh-box"
      >
        <Text testID="box-modifiers">{JSON.stringify(props.modifiers)}</Text>
        {props.children}
      </View>
    );
  }
  function LazyColumn(props: MockBoxProps) {
    return (
      <View testID="lazy-column">
        <Text testID="column-modifiers">{JSON.stringify(props.modifiers)}</Text>
        {props.children}
      </View>
    );
  }
  return { LazyColumn, PullToRefreshBox };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  fillMaxSize: () => ({ $type: "fillMaxSize" }),
  testID: (id: string) => ({ $type: "testID", id }),
}));

function loadAndroidContainer() {
  return jest.requireActual<{
    NativeList: (props: NativeListProps) => React.JSX.Element;
  }>("../../../src/shared/ui/native-list.android.tsx").NativeList;
}

describe("NativeList (Android)", () => {
  test("fills the host on both the pull box and the column so a pull anywhere refreshes", async () => {
    const NativeList = loadAndroidContainer();
    const screen = await render(
      <NativeList onRefresh={jest.fn()} testID="group-list">
        <Text>row</Text>
      </NativeList>,
    );
    expect(screen.getByTestId("box-modifiers").props.children).toBe(
      JSON.stringify([{ $type: "fillMaxSize" }]),
    );
    expect(screen.getByTestId("column-modifiers").props.children).toBe(
      JSON.stringify([
        { $type: "fillMaxSize" },
        { $type: "testID", id: "group-list" },
      ]),
    );
    expect(screen.getByText("row")).toBeTruthy();
  });

  test("shows the indicator only while the refresh promise is pending", async () => {
    const NativeList = loadAndroidContainer();
    let settle: () => void = () => undefined;
    const onRefresh = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const screen = await render(
      <NativeList onRefresh={onRefresh}>
        <Text>row</Text>
      </NativeList>,
    );
    const box = screen.getByTestId("pull-to-refresh-box");
    expect(box.props.accessibilityState).toEqual({ busy: false });
    await fireEvent(box, "refresh");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("pull-to-refresh-box").props.accessibilityState,
    ).toEqual({ busy: true });
    await act(async () => {
      settle();
    });
    expect(
      screen.getByTestId("pull-to-refresh-box").props.accessibilityState,
    ).toEqual({ busy: false });
  });
});
