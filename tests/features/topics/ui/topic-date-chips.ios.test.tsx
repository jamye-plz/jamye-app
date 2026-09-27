import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { TopicDateChips } from "@/features/topics/ui/topic-date-chips.ios";

type ModifierRecord = Readonly<{ $type: string; [key: string]: unknown }>;

jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function Host({
    children,
    testID,
  }: Readonly<{ children?: ReactNode; testID?: string }>) {
    return <View testID={testID}>{children}</View>;
  }
  function ScrollView({
    children,
    modifiers,
  }: Readonly<{
    children?: ReactNode;
    modifiers?: readonly ModifierRecord[];
  }>) {
    return (
      <View testID="date-chips-scroll" {...{ modifiers }}>
        {children}
      </View>
    );
  }
  function HStack({ children }: Readonly<{ children?: ReactNode }>) {
    return <View>{children}</View>;
  }
  function Button({
    label,
    onPress,
    modifiers,
  }: Readonly<{
    label?: string;
    onPress?: () => void;
    modifiers?: readonly ModifierRecord[];
  }>) {
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={onPress}
        {...{ modifiers }}
      >
        <Text>{label}</Text>
      </Pressable>
    );
  }
  return { Button, HStack, Host, ScrollView };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  buttonStyle: (style: string) => ({ $type: "buttonStyle", style }),
  defaultScrollAnchor: (anchor: string) => ({
    $type: "defaultScrollAnchor",
    anchor,
  }),
  defaultScrollAnchorForRole: (anchor: string, role: string) => ({
    $type: "defaultScrollAnchorForRole",
    anchor,
    role,
  }),
  padding: (params: object) => ({ $type: "padding", ...params }),
}));

function findModifier(
  modifiers: readonly ModifierRecord[] | undefined,
  type: string,
): ModifierRecord | undefined {
  return modifiers?.find((modifier) => modifier.$type === type);
}

describe("TopicDateChips (iOS)", () => {
  test("T1: oldest on the left, today/selection on the right, with 오늘/어제/month-day labels", async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <TopicDateChips
        dates={["2026-09-08", "2026-09-10", "2026-09-11"]}
        onSelect={onSelect}
        selected="2026-09-11"
        testID="date-chips"
        today="2026-09-11"
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
      "9월 8일",
      "어제",
      "오늘",
    ]);
    const scroll = screen.getByTestId("date-chips-scroll");
    expect(
      findModifier(scroll.props.modifiers, "defaultScrollAnchor")?.anchor,
    ).toBe("trailing");
  });

  test("iOS 18+: opens scrolled to today but keeps a short strip leading-aligned", async () => {
    const { Platform } =
      jest.requireActual<typeof import("react-native")>("react-native");
    const restore = jest
      .spyOn(Platform, "Version", "get")
      .mockReturnValue("26.0");
    try {
      const screen = await render(
        <TopicDateChips
          dates={["2026-09-10", "2026-09-11"]}
          onSelect={jest.fn()}
          selected="2026-09-11"
          testID="date-chips"
          today="2026-09-11"
        />,
      );
      const modifiers = screen.getByTestId("date-chips-scroll").props
        .modifiers as readonly ModifierRecord[];
      expect(
        modifiers.filter(
          (modifier) => modifier.$type === "defaultScrollAnchorForRole",
        ),
      ).toEqual([
        {
          $type: "defaultScrollAnchorForRole",
          anchor: "trailing",
          role: "initialOffset",
        },
        {
          $type: "defaultScrollAnchorForRole",
          anchor: "leading",
          role: "alignment",
        },
      ]);
      expect(findModifier(modifiers, "defaultScrollAnchor")).toBeUndefined();
    } finally {
      restore.mockRestore();
    }
  });

  test("the selected chip gets a different (emphasized) buttonStyle than the others, and only a tap on a different date selects it", async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <TopicDateChips
        dates={["2026-09-10", "2026-09-11"]}
        onSelect={onSelect}
        selected="2026-09-11"
        today="2026-09-11"
      />,
    );
    const [yesterday, today] = screen.getAllByRole("button");
    const selectedStyle = findModifier(
      today!.props.modifiers,
      "buttonStyle",
    )?.style;
    const unselectedStyle = findModifier(
      yesterday!.props.modifiers,
      "buttonStyle",
    )?.style;
    expect(["glassProminent", "borderedProminent"]).toContain(selectedStyle);
    expect(["glass", "bordered"]).toContain(unselectedStyle);
    expect(selectedStyle).not.toBe(unselectedStyle);
    await fireEvent.press(today!);
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent.press(yesterday!);
    expect(onSelect).toHaveBeenCalledWith("2026-09-10");
  });
});
