import { fireEvent, render } from "@testing-library/react-native";

import { TopicDateChips } from "@/features/topics/ui/topic-date-chips.android";
import type { JamyeDateChipRowNativeViewProps } from "@/shared/ui/jamye-ui-native";

jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Host: ({
      children,
      matchContents,
      testID,
    }: {
      children?: React.ReactNode;
      matchContents?: unknown;
      testID?: string;
    }) => (
      <View {...{ matchContents }} testID={`${testID}-host`}>
        {children}
      </View>
    ),
  };
});

jest.mock("@/shared/ui/jamye-ui-native", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function JamyeDateChipRowNativeView({
    accentColorHex,
    items,
    onDateSelect,
    selectedKey,
    surfaceColorHex,
    testID,
  }: JamyeDateChipRowNativeViewProps) {
    return (
      <View testID={testID ?? "date-chip-row"}>
        {items.map((item) => (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            accessibilityState={{ selected: item.key === selectedKey }}
            key={item.key}
            onPress={() =>
              onDateSelect?.({ nativeEvent: { key: item.key } } as never)
            }
            style={{
              backgroundColor:
                item.key === selectedKey ? accentColorHex : surfaceColorHex,
            }}
          >
            <Text>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return { JamyeDateChipRowNativeView };
});

describe("TopicDateChips (Android)", () => {
  test("T1: oldest on the left, today/selection on the right, forwarding onSelect from the native key event", async () => {
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
    expect(buttons[2]!.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(buttons[1]!);
    expect(onSelect).toHaveBeenCalledWith("2026-09-10");
  });

  test("hosts the LazyRow at the row width: a horizontal matchContents measures it unbounded and crashes Compose", async () => {
    const screen = await render(
      <TopicDateChips
        dates={["2026-09-11"]}
        onSelect={jest.fn()}
        selected="2026-09-11"
        testID="date-chips"
        today="2026-09-11"
      />,
    );
    expect(screen.getByTestId("date-chips-host").props.matchContents).toEqual({
      vertical: true,
    });
  });
});
