import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import {
  DATE_DIAL_ITEM_WIDTH,
  TopicDateDial,
} from "@/features/topics/ui/topic-date-dial";

const DATES = ["2026-09-20", "2026-09-21", "2026-09-22"] as const;

async function setup(selected = "2026-09-22") {
  const onSelect = jest.fn();
  const screen = await render(
    <AppThemeProvider>
      <TopicDateDial
        dates={DATES}
        onSelect={onSelect}
        selected={selected}
        today="2026-09-22"
      />
    </AppThemeProvider>,
  );
  return { onSelect, screen, dial: screen.getByLabelText("주제 날짜 선택") };
}

describe("TopicDateDial", () => {
  test("labels today and yesterday and reports the selection to assistive tech", async () => {
    const { dial, screen } = await setup();
    expect(screen.getByText("오늘")).toBeTruthy();
    expect(screen.getByText("어제")).toBeTruthy();
    expect(screen.getByText("2026-09-20")).toBeTruthy();
    expect(dial.props.accessibilityRole).toBe("adjustable");
    expect(dial.props.accessibilityValue).toEqual({ text: "오늘" });
  });

  test("tapping a visible date selects it at once; the selected date is inert", async () => {
    const { onSelect, screen } = await setup();
    await fireEvent.press(screen.getByRole("button", { name: "어제 선택" }));
    expect(onSelect).toHaveBeenLastCalledWith("2026-09-21");
    onSelect.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "오늘 선택" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "오늘 선택" }).props
        .accessibilityState,
    ).toEqual({ selected: true });
  });

  test("commits the centered date once the strip settles, never while dragging", async () => {
    const { dial, onSelect } = await setup();
    await fireEvent(dial, "scrollEndDrag", {
      nativeEvent: {
        contentOffset: { x: DATE_DIAL_ITEM_WIDTH },
        velocity: { x: 1.2, y: 0 },
      },
    });
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent(dial, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: DATE_DIAL_ITEM_WIDTH } },
    });
    expect(onSelect).toHaveBeenLastCalledWith("2026-09-21");
    await fireEvent(dial, "scrollEndDrag", {
      nativeEvent: { contentOffset: { x: 0 }, velocity: { x: 0, y: 0 } },
    });
    expect(onSelect).toHaveBeenLastCalledWith("2026-09-20");
    onSelect.mockClear();
    await fireEvent(dial, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 2 * DATE_DIAL_ITEM_WIDTH } },
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("clamps overscroll to the last date", async () => {
    const { dial, onSelect } = await setup("2026-09-20");
    await fireEvent(dial, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 9 * DATE_DIAL_ITEM_WIDTH } },
    });
    expect(onSelect).toHaveBeenLastCalledWith("2026-09-22");
  });

  test("accessibility increment/decrement step through neighbouring dates", async () => {
    const { dial, onSelect } = await setup("2026-09-21");
    await fireEvent(dial, "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(onSelect).toHaveBeenLastCalledWith("2026-09-20");
    await fireEvent(dial, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(onSelect).toHaveBeenLastCalledWith("2026-09-22");
  });
});
