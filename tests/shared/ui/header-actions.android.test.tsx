import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { HeaderActions } from "@/shared/ui/header-actions.android";
import type { HeaderAction } from "@/shared/ui/header-actions.android";

type ScreenOptions = Readonly<{ headerRight?: () => ReactNode }>;
const mockScreen = jest.fn((_options: ScreenOptions | undefined) => undefined);
const mockIcon = jest.fn(
  (_props: { contentDescription?: string; source?: unknown; tint?: unknown }) =>
    undefined,
);
const mockMenu = jest.fn(
  (_props: { color?: unknown; expanded?: boolean }) => undefined,
);

jest.mock("expo-router", () => ({
  Stack: {
    Screen: (props: Readonly<{ options?: ScreenOptions }>) => {
      mockScreen(props.options);
      return props.options?.headerRight ? (
        <>{props.options.headerRight()}</>
      ) : null;
    },
  },
}));
jest.mock("@expo/ui/jetpack-compose", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Host({ children }: MockChildren) {
    return <View testID="compose-host">{children}</View>;
  }
  function Row({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  function IconButton({
    children,
    enabled = true,
    onClick,
  }: Readonly<{
    children?: ReactNode;
    enabled?: boolean;
    onClick?: () => void;
  }>) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        onPress={onClick}
        testID="icon-button"
      >
        {children}
      </Pressable>
    );
  }
  function Icon(props: {
    contentDescription?: string;
    source?: unknown;
    tint?: unknown;
  }) {
    mockIcon(props);
    return <Text>{props.contentDescription ?? ""}</Text>;
  }
  function DropdownMenu({
    children,
    color,
    expanded,
  }: Readonly<{ children?: ReactNode; color?: unknown; expanded?: boolean }>) {
    mockMenu({ color, expanded });
    return <View>{children}</View>;
  }
  DropdownMenu.Trigger = Row;
  DropdownMenu.Items = Row;
  function DropdownMenuItem({
    children,
    enabled = true,
    onClick,
  }: Readonly<{
    children?: ReactNode;
    enabled?: boolean;
    onClick?: () => void;
  }>) {
    return (
      <Pressable
        accessibilityRole="menuitem"
        disabled={!enabled}
        onPress={onClick}
      >
        {children}
      </Pressable>
    );
  }
  DropdownMenuItem.Text = Row;
  DropdownMenuItem.LeadingIcon = Row;
  function ComposeText({ children }: MockChildren) {
    return <Text>{children}</Text>;
  }
  return {
    DropdownMenu,
    DropdownMenuItem,
    Host,
    Icon,
    IconButton,
    Row,
    Text: ComposeText,
  };
});

describe("HeaderActions (Android) — ADR 0010 Material icon buttons and dropdown menus", () => {
  const onAdd = jest.fn();
  const onInfo = jest.fn();
  const onCreate = jest.fn();
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
          key: "join",
          onPress: jest.fn(),
          symbol: "add",
          title: "초대 코드로 가입",
        },
      ],
      key: "add",
      kind: "menu",
      symbol: "add",
    },
  ];
  beforeEach(() => jest.clearAllMocks());

  test("hosts Compose icon buttons in headerRight with drawable sources and labels", async () => {
    const screen = await render(<HeaderActions actions={buttons} />);
    expect(screen.getByTestId("compose-host")).toBeTruthy();
    const icons = mockIcon.mock.calls.map((call) => call[0]);
    expect(icons.map((icon) => icon.contentDescription)).toEqual([
      "새 주제",
      "그룹 정보",
    ]);
    for (const icon of icons) {
      expect(icon.source).toBeDefined();
      expect(icon.tint).toBe("#201A1C");
    }
    await fireEvent.press(screen.getByText("새 주제"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText("그룹 정보"));
    expect(onInfo).not.toHaveBeenCalled();
  });

  test("a menu action opens a dropdown from its icon button and closes after an item runs", async () => {
    const screen = await render(<HeaderActions actions={menu} />);
    expect(mockMenu).toHaveBeenLastCalledWith({
      color: "#F7EBED",
      expanded: false,
    });
    await fireEvent.press(screen.getByText("그룹 추가"));
    expect(mockMenu).toHaveBeenLastCalledWith({
      color: "#F7EBED",
      expanded: true,
    });
    const leadingIcons = mockIcon.mock.calls
      .map((call) => call[0])
      .filter((icon) => icon.contentDescription === undefined);
    // Both items carry a Material leading icon (group / add drawables).
    expect(leadingIcons.length).toBeGreaterThanOrEqual(2);
    for (const icon of leadingIcons) expect(icon.source).toBeDefined();
    await fireEvent.press(screen.getByText("새 그룹 만들기"));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(mockMenu).toHaveBeenLastCalledWith({
      color: "#F7EBED",
      expanded: false,
    });
  });

  test("clears headerRight when there are no actions", async () => {
    await render(<HeaderActions actions={[]} />);
    expect(mockScreen).toHaveBeenLastCalledWith({ headerRight: undefined });
  });
});
