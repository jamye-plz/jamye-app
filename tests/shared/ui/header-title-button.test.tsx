import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { HeaderTitleButton } from "@/shared/ui/header-title-button";

describe("HeaderTitleButton", () => {
  test("is a button labelled with the title, hints its target and fires onPress", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <AppThemeProvider>
        <HeaderTitleButton
          accessibilityHint="그룹 정보를 엽니다"
          onPress={onPress}
          title="우리 그룹"
        />
      </AppThemeProvider>,
    );
    const button = screen.getByRole("button", { name: "우리 그룹" });
    expect(button.props.accessibilityHint).toBe("그룹 정보를 엽니다");
    expect(screen.getByText("우리 그룹").props.numberOfLines).toBe(1);
    // jest runs as iOS: the title is capped so it never runs under the bar items.
    expect(StyleSheet.flatten(button.props.style).maxWidth).toBeGreaterThan(0);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
