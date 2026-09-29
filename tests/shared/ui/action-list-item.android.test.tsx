import { fireEvent, render, within } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";
import type {
  ActionListItemProps,
  RowAction,
} from "@/shared/ui/action-list-item.types";

// The shared manual mock, except that `RNHostView` exposes `matchContents`
// so the leading-slot hosting test below can see how the row hosts it.
jest.mock("@expo/ui", () => {
  const shared = jest.requireActual<typeof import("../../__mocks__/@expo/ui")>(
    "../../__mocks__/@expo/ui",
  );
  const { View: RNView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function RNHostView(
    props: Readonly<{ children?: ReactNode; matchContents?: boolean }>,
  ) {
    return (
      <RNView
        testID={
          props.matchContents ? "rn-host-view-match-contents" : "rn-host-view"
        }
      >
        {props.children}
      </RNView>
    );
  }
  return { ...shared, RNHostView };
});
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

  test("M15 device regression: the leading RN view is hosted through RNHostView matchContents, never bare in the Compose slot", async () => {
    // A bare RN avatar here crashed the app on device ("The specified child
    // already has a parent") when a topic row with rows below it was
    // deleted: `LazyColumn` rebuilds the index-keyed rows under it.
    const ActionListItem = loadAndroidRow();
    const screen = await render(
      <AppThemeProvider>
        <ActionListItem
          actions={actions}
          leading={<View testID="leading-avatar" />}
          onPress={jest.fn()}
          testID="row"
          title="우리 그룹"
        />
      </AppThemeProvider>,
    );
    expect(
      within(screen.getByTestId("rn-host-view-match-contents")).getByTestId(
        "leading-avatar",
      ),
    ).toBeTruthy();

    const { screen: withoutLeading } = await setup();
    expect(
      withoutLeading.queryByTestId("rn-host-view-match-contents"),
    ).toBeNull();
  });
});
