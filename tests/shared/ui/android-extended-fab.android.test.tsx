import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";

import type {
  AndroidExtendedFabItem,
  AndroidExtendedFabProps,
} from "@/shared/ui/android-extended-fab.android";

jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function Host(props: Readonly<{ children?: ReactNode }>) {
    return <View>{props.children}</View>;
  }
  return { Host };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("@expo/ui/jetpack-compose", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyPressable = Pressable as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function ExtendedFloatingActionButton(
    props: Readonly<{
      children?: ReactNode;
      modifiers?: unknown[];
      onClick?: () => void;
    }>,
  ) {
    return (
      <AnyPressable
        accessibilityRole="button"
        modifiers={props.modifiers}
        onPress={props.onClick}
        testID="fab"
      >
        {props.children}
      </AnyPressable>
    );
  }
  const slot = () =>
    function MockSlot({ children }: MockChildren) {
      return <View>{children}</View>;
    };
  ExtendedFloatingActionButton.Icon = slot();
  ExtendedFloatingActionButton.Text = slot();
  function DropdownMenu(
    props: Readonly<{ children?: ReactNode; expanded?: boolean }>,
  ) {
    return (
      <View
        accessibilityState={{ expanded: Boolean(props.expanded) }}
        testID="dropdown-menu"
      >
        {props.children}
      </View>
    );
  }
  DropdownMenu.Trigger = slot();
  DropdownMenu.Items = slot();
  function DropdownMenuItem(
    props: Readonly<{ children?: ReactNode; onClick?: () => void }>,
  ) {
    return (
      <Pressable accessibilityRole="menuitem" onPress={props.onClick}>
        {props.children}
      </Pressable>
    );
  }
  DropdownMenuItem.LeadingIcon = slot();
  DropdownMenuItem.Text = slot();
  function Icon(props: Readonly<{ contentDescription?: string }>) {
    return <View accessibilityLabel={props.contentDescription} testID="icon" />;
  }
  function ComposeText({ children }: Readonly<{ children?: ReactNode }>) {
    return <Text>{children}</Text>;
  }
  return {
    DropdownMenu,
    DropdownMenuItem,
    ExtendedFloatingActionButton,
    Icon,
    Text: ComposeText,
  };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  testID: (id: string) => ({ $type: "testID", id }),
}));

function loadAndroidFab() {
  return jest.requireActual<{
    AndroidExtendedFab: (props: AndroidExtendedFabProps) => React.JSX.Element;
  }>("../../../src/shared/ui/android-extended-fab.android.tsx")
    .AndroidExtendedFab;
}

describe("AndroidExtendedFab", () => {
  test("a single item (T5) runs immediately on tap without opening a menu", async () => {
    const AndroidExtendedFab = loadAndroidFab();
    const onPress = jest.fn();
    const items: AndroidExtendedFabItem[] = [
      { key: "create", label: "새 주제", onPress },
    ];
    const screen = await render(
      <AndroidExtendedFab
        icon="add"
        items={items}
        label="새 주제"
        testID="topics-fab"
      />,
    );
    expect(screen.queryByTestId("dropdown-menu")).toBeNull();
    await fireEvent.press(screen.getByTestId("fab"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("fab").props.modifiers).toEqual([
      { $type: "testID", id: "topics-fab" },
    ]);
  });

  test("two or more items (G3) open a dropdown menu instead of running the first item", async () => {
    const AndroidExtendedFab = loadAndroidFab();
    const create = jest.fn();
    const join = jest.fn();
    const items: AndroidExtendedFabItem[] = [
      { key: "create", label: "새 그룹 만들기", onPress: create },
      {
        icon: "removeMember",
        key: "join",
        label: "초대 코드로 가입",
        onPress: join,
      },
    ];
    const screen = await render(
      <AndroidExtendedFab icon="groupAdd" items={items} label="그룹 추가" />,
    );
    expect(
      screen.getByTestId("dropdown-menu").props.accessibilityState,
    ).toEqual({
      expanded: false,
    });
    await fireEvent.press(screen.getByTestId("fab"));
    expect(create).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("dropdown-menu").props.accessibilityState,
    ).toEqual({
      expanded: true,
    });
    await fireEvent.press(screen.getByText("초대 코드로 가입"));
    expect(join).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("dropdown-menu").props.accessibilityState,
    ).toEqual({
      expanded: false,
    });
  });

  test("an item without its own icon renders no leading icon in the menu", async () => {
    const AndroidExtendedFab = loadAndroidFab();
    const items: AndroidExtendedFabItem[] = [
      { key: "a", label: "옵션 A", onPress: jest.fn() },
      { key: "b", label: "옵션 B", onPress: jest.fn() },
    ];
    const screen = await render(
      <AndroidExtendedFab icon="add" items={items} label="추가" />,
    );
    expect(screen.queryAllByTestId("icon")).toHaveLength(1);
  });
});
