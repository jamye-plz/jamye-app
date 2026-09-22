import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { HeaderActions } from "@/shared/ui/header-actions";
import type { HeaderAction } from "@/shared/ui/header-actions";

type ItemRecord = Readonly<{
  accessibilityLabel?: string;
  destructive?: boolean;
  disabled?: boolean;
  icon?: unknown;
  label?: string;
}>;
const mockToolbar = jest.fn((_props: { placement?: string }) => undefined);
const mockButton = jest.fn((_props: ItemRecord) => undefined);
const mockMenu = jest.fn((_props: ItemRecord) => undefined);
const mockMenuAction = jest.fn((_props: ItemRecord) => undefined);

jest.mock("expo-router", () => {
  const { Pressable, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockItemProps = Readonly<{
    accessibilityLabel?: string;
    children?: ReactNode;
    destructive?: boolean;
    disabled?: boolean;
    icon?: unknown;
    onPress?: () => void;
  }>;
  function Toolbar({
    children,
    placement,
  }: Readonly<{ children?: ReactNode; placement?: string }>) {
    mockToolbar({ placement });
    return <View testID="toolbar">{children}</View>;
  }
  function ToolbarButton(props: MockItemProps) {
    mockButton({
      accessibilityLabel: props.accessibilityLabel,
      disabled: props.disabled,
      icon: props.icon,
    });
    return (
      <Pressable
        accessibilityLabel={props.accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: props.disabled ?? false }}
        disabled={props.disabled}
        onPress={props.onPress}
      />
    );
  }
  function ToolbarMenu(props: MockItemProps) {
    mockMenu({
      accessibilityLabel: props.accessibilityLabel,
      disabled: props.disabled,
      icon: props.icon,
    });
    return (
      <View>
        <Pressable
          accessibilityLabel={props.accessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: props.disabled ?? false }}
        />
        {props.children}
      </View>
    );
  }
  function ToolbarMenuAction(props: MockItemProps) {
    const label = typeof props.children === "string" ? props.children : "";
    mockMenuAction({
      destructive: props.destructive,
      disabled: props.disabled,
      icon: props.icon,
      label,
    });
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="menuitem"
        disabled={props.disabled}
        onPress={props.onPress}
      />
    );
  }
  Toolbar.Button = ToolbarButton;
  Toolbar.Menu = ToolbarMenu;
  Toolbar.MenuAction = ToolbarMenuAction;
  return { Stack: { Toolbar } };
});

describe("HeaderActions (iOS) — ADR 0010 native bar buttons and pull-down menus", () => {
  const onAdd = jest.fn();
  const onInfo = jest.fn();
  const onCreate = jest.fn();
  const onJoin = jest.fn();
  const buttons: readonly HeaderAction[] = [
    {
      accessibilityLabel: "새 주제",
      key: "add",
      onPress: onAdd,
      symbol: "add",
    },
    {
      accessibilityLabel: "그룹 정보",
      disabled: true,
      key: "info",
      onPress: onInfo,
      symbol: "info",
    },
  ];
  const menu: readonly HeaderAction[] = [
    {
      accessibilityLabel: "그룹 추가",
      items: [
        {
          key: "create",
          onPress: onCreate,
          symbol: "group",
          title: "새 그룹 만들기",
        },
        {
          destructive: true,
          key: "join",
          onPress: onJoin,
          title: "초대 코드로 가입",
        },
      ],
      key: "add",
      kind: "menu",
      symbol: "add",
    },
  ];
  beforeEach(() => jest.clearAllMocks());

  test("renders native bar button items with SF Symbols in the right toolbar", async () => {
    const screen = await render(<HeaderActions actions={buttons} />);
    expect(mockToolbar).toHaveBeenCalledWith({ placement: "right" });
    expect(mockButton.mock.calls.map((call) => call[0])).toEqual([
      { accessibilityLabel: "새 주제", disabled: undefined, icon: "plus" },
      { accessibilityLabel: "그룹 정보", disabled: true, icon: "info.circle" },
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "새 주제" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "그룹 정보" }));
    expect(onInfo).not.toHaveBeenCalled();
  });

  test("a menu action becomes a native menu whose items run their handlers", async () => {
    const screen = await render(<HeaderActions actions={menu} />);
    expect(mockMenu).toHaveBeenCalledWith({
      accessibilityLabel: "그룹 추가",
      disabled: undefined,
      icon: "plus",
    });
    expect(mockMenuAction.mock.calls.map((call) => call[0])).toEqual([
      {
        destructive: undefined,
        disabled: undefined,
        icon: "person.2",
        label: "새 그룹 만들기",
      },
      {
        destructive: true,
        disabled: undefined,
        icon: undefined,
        label: "초대 코드로 가입",
      },
    ]);
    expect(mockButton).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("menuitem", { name: "새 그룹 만들기" }),
    );
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onJoin).not.toHaveBeenCalled();
  });

  test("renders an empty toolbar without actions", async () => {
    const screen = await render(<HeaderActions actions={[]} />);
    expect(mockToolbar).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
