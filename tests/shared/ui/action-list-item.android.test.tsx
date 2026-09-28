import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";
import type {
  ActionListItemProps,
  RowAction,
} from "@/shared/ui/action-list-item.types";

jest.mock("@expo/ui/jetpack-compose", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
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
  function MockSlot({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  DropdownMenu.Trigger = MockSlot;
  DropdownMenu.Items = MockSlot;
  function DropdownMenuItem(
    props: Readonly<{
      children?: ReactNode;
      enabled?: boolean;
      onClick?: () => void;
    }>,
  ) {
    return (
      <Pressable
        accessibilityRole="menuitem"
        accessibilityState={{ disabled: props.enabled === false }}
        onPress={props.onClick}
      >
        {props.children}
      </Pressable>
    );
  }
  DropdownMenuItem.LeadingIcon = MockSlot;
  DropdownMenuItem.Text = MockSlot;
  function Icon(
    props: Readonly<{ contentDescription?: string; tint?: string }>,
  ) {
    return (
      <View
        accessibilityHint={props.tint}
        accessibilityLabel={props.contentDescription}
      />
    );
  }
  function IconButton(
    props: Readonly<{ children?: ReactNode; onClick?: () => void }>,
  ) {
    return (
      <Pressable accessibilityRole="button" onPress={props.onClick}>
        {props.children}
      </Pressable>
    );
  }
  function ComposeText(props: Readonly<{ children?: string; color?: string }>) {
    return <Text style={{ color: props.color }}>{props.children}</Text>;
  }
  return {
    DropdownMenu,
    DropdownMenuItem,
    Icon,
    IconButton,
    Text: ComposeText,
  };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  combinedClickable: (handlers: {
    onClick?: () => void;
    onLongClick?: () => void;
  }) => ({ $type: "combinedClickable", ...handlers }),
}));

function loadAndroidRow() {
  return jest.requireActual<{
    ActionListItem: (props: ActionListItemProps) => React.JSX.Element;
  }>("../../../src/shared/ui/action-list-item.android.tsx").ActionListItem;
}

const actions: RowAction[] = [
  { key: "info", onPress: jest.fn(), symbol: "info", title: "상세" },
  {
    destructive: true,
    disabled: true,
    key: "leave",
    onPress: jest.fn(),
    symbol: "leave",
    title: "그룹 나가기",
  },
];

async function setup(rowActions = actions) {
  const ActionListItem = loadAndroidRow();
  const onPress = jest.fn();
  const screen = await render(
    <AppThemeProvider>
      <ActionListItem
        actions={rowActions}
        onPress={onPress}
        supportingText="2 / 12명"
        testID="row"
        title="우리 그룹"
      />
    </AppThemeProvider>,
  );
  return { onPress, screen };
}

describe("ActionListItem (Android)", () => {
  test("tap runs the primary action; long press and the ⋮ button open the same dropdown", async () => {
    const { onPress, screen } = await setup();
    const row = screen.getByTestId("row");
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("dropdown-menu").props.accessibilityState,
    ).toEqual({
      expanded: false,
    });
    await fireEvent(row, "longPress");
    expect(
      screen.getByTestId("dropdown-menu").props.accessibilityState,
    ).toEqual({
      expanded: true,
    });
    await fireEvent.press(screen.getByText("상세"));
    expect(actions[0]!.onPress).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("dropdown-menu").props.accessibilityState,
    ).toEqual({
      expanded: false,
    });
    await fireEvent.press(screen.getByLabelText("우리 그룹 메뉴"));
    expect(
      screen.getByTestId("dropdown-menu").props.accessibilityState,
    ).toEqual({
      expanded: true,
    });
  });

  test("destructive items use the Material error color and disabled items stay disabled", async () => {
    const { screen } = await setup();
    expect(screen.getByText("그룹 나가기")).toHaveStyle({
      color: androidThemeColors("light").error,
    });
    expect(
      screen.getByRole("menuitem", { name: "그룹 나가기" }).props
        .accessibilityState,
    ).toEqual({ disabled: true });
  });

  test("without actions there is no menu and no long-press handler", async () => {
    const { screen } = await setup([]);
    expect(screen.queryByTestId("dropdown-menu")).toBeNull();
    expect(screen.getByTestId("row").props.onLongPress).toBeUndefined();
  });

  test("N2: a markRead action (edge/swipeLabel are iOS-only) still surfaces in the ⋮ menu by its title", async () => {
    const onPress = jest.fn();
    const { screen } = await setup([
      {
        edge: "leading",
        key: "markRead",
        onPress,
        swipeLabel: "읽음",
        symbol: "markRead",
        title: "읽음으로 표시",
      },
    ]);
    await fireEvent.press(screen.getByLabelText("우리 그룹 메뉴"));
    await fireEvent.press(screen.getByText("읽음으로 표시"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
