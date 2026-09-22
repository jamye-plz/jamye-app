import { fireEvent, render, within } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { ActionListItem } from "@/shared/ui/action-list-item";
import type { RowAction } from "@/shared/ui/action-list-item.types";

jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Button(
    props: Readonly<{
      label?: string;
      modifiers?: unknown[];
      onPress?: () => void;
      role?: string;
      systemImage?: string;
    }>,
  ) {
    return (
      <Pressable
        accessibilityHint={props.role}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(props.modifiers?.length) }}
        onPress={props.onPress}
        testID={`symbol-${props.systemImage}`}
      >
        <Text>{props.label}</Text>
      </Pressable>
    );
  }
  const box = (testID: string) =>
    function MockBox({ children }: MockChildren) {
      return <View testID={testID}>{children}</View>;
    };
  const SwipeActions = box("swipe-actions") as ReturnType<typeof box> & {
    Actions: ReturnType<typeof box>;
  };
  SwipeActions.Actions = box("swipe-actions-trailing");
  const ContextMenu = box("context-menu") as ReturnType<typeof box> & {
    Items: ReturnType<typeof box>;
    Trigger: ReturnType<typeof box>;
  };
  ContextMenu.Items = box("context-menu-items");
  ContextMenu.Trigger = box("context-menu-trigger");
  return { Button, ContextMenu, SwipeActions };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  disabled: (value: boolean) => ({ $type: "disabled", value }),
}));

const actions: RowAction[] = [
  { key: "info", onPress: jest.fn(), symbol: "info", title: "상세" },
  {
    destructive: true,
    key: "delete",
    onPress: jest.fn(),
    symbol: "delete",
    title: "삭제",
  },
];

describe("ActionListItem (iOS)", () => {
  test("tap runs the primary action; swipe puts the destructive action at the edge; the context menu keeps the given order", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ActionListItem
        actions={actions}
        onPress={onPress}
        supportingText="2 / 12명"
        testID="row"
        title="우리 그룹"
      />,
    );
    await fireEvent.press(screen.getByText("우리 그룹"));
    expect(onPress).toHaveBeenCalledTimes(1);
    const swipe = within(screen.getByTestId("swipe-actions-trailing"));
    expect(
      swipe.getAllByRole("button").map((b) => b.props.accessibilityLabel),
    ).toEqual(["삭제", "상세"]);
    expect(
      swipe.getByRole("button", { name: "삭제" }).props.accessibilityHint,
    ).toBe("destructive");
    const menu = within(screen.getByTestId("context-menu-items"));
    expect(
      menu.getAllByRole("button").map((b) => b.props.accessibilityLabel),
    ).toEqual(["상세", "삭제"]);
    expect(menu.getByTestId("symbol-trash")).toBeTruthy();
    await fireEvent.press(swipe.getByRole("button", { name: "상세" }));
    expect(actions[0]!.onPress).toHaveBeenCalledTimes(1);
  });

  test("renders a plain row without swipe or menu when there are no actions", async () => {
    const screen = await render(
      <ActionListItem actions={[]} onPress={jest.fn()} title="우리 그룹" />,
    );
    expect(screen.queryByTestId("swipe-actions")).toBeNull();
    expect(screen.queryByTestId("context-menu")).toBeNull();
    expect(screen.getByText("우리 그룹")).toBeTruthy();
  });

  test("a disabled action is disabled in both the swipe and the menu", async () => {
    const screen = await render(
      <ActionListItem
        actions={[{ ...actions[0]!, disabled: true }]}
        onPress={jest.fn()}
        title="우리 그룹"
      />,
    );
    for (const button of screen.getAllByRole("button", { name: "상세" }))
      expect(button.props.accessibilityState).toEqual({ disabled: true });
  });
});
