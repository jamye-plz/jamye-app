import { fireEvent, render, within } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { PlatformColor } from "react-native";
import { ActionListItem } from "@/shared/ui/action-list-item";
import type { RowAction } from "@/shared/ui/action-list-item.types";

// The shared manual mock renders Icon as null; make the chevron queryable.
jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ...jest.requireActual<Record<string, unknown>>("../../__mocks__/@expo/ui"),
    Icon: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});
jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  type MockModifier = Readonly<{ $type: string; value?: unknown }>;
  function Button(
    props: Readonly<{
      label?: string;
      modifiers?: readonly MockModifier[];
      onPress?: () => void;
      role?: string;
      systemImage?: string;
    }>,
  ) {
    const isDisabled = Boolean(
      props.modifiers?.some((modifier) => modifier.$type === "disabled"),
    );
    return (
      <Pressable
        accessibilityHint={props.role}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        accessibilityValue={
          props.modifiers?.length
            ? {
                // `JSON.stringify` (not `String`) so an object-shaped value
                // (e.g. `tint`'s `PlatformColor(...)` result) round-trips
                // into something a test can compare with `toEqual`.
                text: props.modifiers
                  .map(
                    (modifier) =>
                      `${modifier.$type}:${JSON.stringify(modifier.value)}`,
                  )
                  .join(","),
              }
            : undefined
        }
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
    Actions: (
      props: MockChildren & { edge?: "leading" | "trailing" },
    ) => React.JSX.Element;
  };
  // `edge` decides the group's testID so a test can tell the leading (N2
  // "읽음") group apart from the trailing one, mirroring how the real
  // `SwipeActions.Actions` puts each group on its own screen edge.
  SwipeActions.Actions = function MockSwipeActionsGroup({
    children,
    edge = "trailing",
  }) {
    return <View testID={`swipe-actions-${edge}`}>{children}</View>;
  };
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
  // The real `tint` takes a `ShapeStyle` -- on iOS the caller passes the
  // theme's `colors.error` (`PlatformColor("systemRed")`, an object), not a
  // string, so this mock echoes back whatever it's given rather than typing
  // it as a color name.
  tint: (value: unknown) => ({ $type: "tint", value }),
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
    // M15/AC3/AC5 r3: the swipe 삭제 button carries the theme's error color
    // (iOS `PlatformColor("systemRed")` -- the same red the destructive role
    // rendered, and dark-mode aware, unlike a literal hex) as a tint instead
    // of a destructive role, so SwiftUI's swipeActions won't hide the row
    // before this app's own ConfirmAlert (E10) runs.
    //
    // Checked via `.accessibilityValue?.text` (not the whole object with
    // `toBeUndefined()`/plain `toEqual`): the real RN `Pressable` we render
    // through (react-native/Libraries/Components/Pressable/Pressable.js)
    // unconditionally rebuilds `accessibilityValue` as `{max, min, now,
    // text}`, so even a button with nothing to encode still has a defined
    // object there (every field `undefined`) -- `.text` is the one field
    // this mock actually controls.
    const deleteSwipeButton = swipe.getByRole("button", { name: "삭제" });
    expect(deleteSwipeButton.props.accessibilityHint).toBeUndefined();
    expect(deleteSwipeButton.props.accessibilityValue?.text).toBe(
      `tint:${JSON.stringify(PlatformColor("systemRed"))}`,
    );
    // A non-destructive swipe button gets neither a role nor a tint.
    const infoSwipeButton = swipe.getByRole("button", { name: "상세" });
    expect(infoSwipeButton.props.accessibilityHint).toBeUndefined();
    expect(infoSwipeButton.props.accessibilityValue?.text).toBeUndefined();
    const menu = within(screen.getByTestId("context-menu-items"));
    expect(
      menu.getAllByRole("button").map((b) => b.props.accessibilityLabel),
    ).toEqual(["상세", "삭제"]);
    expect(menu.getByTestId("symbol-trash")).toBeTruthy();
    // The context menu never hides a row on tap, so it keeps the real
    // destructive role (E11).
    expect(
      menu.getByRole("button", { name: "삭제" }).props.accessibilityHint,
    ).toBe("destructive");
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

  test("a row that opens another screen shows the chevron", async () => {
    const screen = await render(
      <ActionListItem actions={[]} onPress={jest.fn()} title="우리 그룹" />,
    );
    expect(screen.getByTestId("icon-chevron.right")).toBeTruthy();
  });

  test("disclosure={false} drops the chevron for rows that act in place", async () => {
    const screen = await render(
      <ActionListItem
        actions={[]}
        disclosure={false}
        onPress={jest.fn()}
        title="초대 링크 공유"
      />,
    );
    expect(screen.queryByTestId("icon-chevron.right")).toBeNull();
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

  test("N2: a leading action gets its own leading swipe group with a distinct swipeLabel, and still lists its title in the menu", async () => {
    const onMarkRead = jest.fn();
    const markRead: RowAction = {
      edge: "leading",
      key: "markRead",
      onPress: onMarkRead,
      swipeLabel: "읽음",
      symbol: "markRead",
      title: "읽음으로 표시",
    };
    const screen = await render(
      <ActionListItem
        actions={[markRead, actions[0]!]}
        onPress={jest.fn()}
        title="공지"
      />,
    );
    const leadingSwipe = within(screen.getByTestId("swipe-actions-leading"));
    expect(leadingSwipe.getByRole("button", { name: "읽음" })).toBeTruthy();
    expect(leadingSwipe.queryByText("읽음으로 표시")).toBeNull();
    const trailingSwipe = within(screen.getByTestId("swipe-actions-trailing"));
    expect(trailingSwipe.queryByRole("button", { name: "읽음" })).toBeNull();
    expect(trailingSwipe.getByRole("button", { name: "상세" })).toBeTruthy();
    const menu = within(screen.getByTestId("context-menu-items"));
    expect(
      menu.getAllByRole("button").map((b) => b.props.accessibilityLabel),
    ).toEqual(["읽음으로 표시", "상세"]);
    await fireEvent.press(leadingSwipe.getByRole("button", { name: "읽음" }));
    expect(onMarkRead).toHaveBeenCalledTimes(1);
  });

  test("a leading action without a separate swipeLabel falls back to title on the swipe button", async () => {
    const screen = await render(
      <ActionListItem
        actions={[
          {
            edge: "leading",
            key: "markRead",
            onPress: jest.fn(),
            symbol: "markRead",
            title: "읽음으로 표시",
          },
        ]}
        onPress={jest.fn()}
        title="공지"
      />,
    );
    const leadingSwipe = within(screen.getByTestId("swipe-actions-leading"));
    expect(
      leadingSwipe.getByRole("button", { name: "읽음으로 표시" }),
    ).toBeTruthy();
  });

  test("when every action is leading, no trailing swipe group renders", async () => {
    const screen = await render(
      <ActionListItem
        actions={[
          {
            edge: "leading",
            key: "markRead",
            onPress: jest.fn(),
            symbol: "markRead",
            title: "읽음으로 표시",
          },
        ]}
        onPress={jest.fn()}
        title="공지"
      />,
    );
    expect(screen.queryByTestId("swipe-actions-trailing")).toBeNull();
  });
});
