import { fireEvent, render, within } from "@testing-library/react-native";
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

  test("caps font scaling for the title and subtitle on iOS so the header block never grows past its default footprint at large Dynamic Type (C15)", async () => {
    const screen = await render(
      <AppThemeProvider>
        <HeaderTitleButton subtitle="동기화 중…" title="그룹 채팅" />
      </AppThemeProvider>,
    );
    const title = screen.getByText("그룹 채팅");
    const subtitle = screen.getByText("동기화 중…");
    // jest runs as iOS (jest-expo inlines EXPO_OS="ios"). The native nav bar
    // is a fixed 44pt and never grows for Dynamic Type, so the custom header
    // block must not grow past its own default footprint either. Title
    // (headline, 22pt line height) already fills the 44pt button row, so
    // capping at 2x keeps it at exactly 22 * 2 = 44pt. Subtitle (body, 26pt
    // line height) caps at 1.2x = 31.2pt, at most ~5pt over its default.
    expect(title.props.maxFontSizeMultiplier).toBeLessThanOrEqual(2);
    expect(subtitle.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.2);
    expect(subtitle.props.numberOfLines).toBe(1);
  });

  test("renders the same capped, muted subtitle beneath an interactive title as beneath a plain one", async () => {
    const plain = await render(
      <AppThemeProvider>
        <HeaderTitleButton subtitle="동기화 중…" title="그룹 채팅" />
      </AppThemeProvider>,
    );
    const plainSubtitle = plain.getByText("동기화 중…");
    const plainProps = {
      maxFontSizeMultiplier: plainSubtitle.props.maxFontSizeMultiplier,
      numberOfLines: plainSubtitle.props.numberOfLines,
      style: StyleSheet.flatten(plainSubtitle.props.style),
    };
    await plain.unmount();

    const interactive = await render(
      <AppThemeProvider>
        <HeaderTitleButton
          onPress={jest.fn()}
          subtitle="동기화 중…"
          title="그룹 채팅"
        />
      </AppThemeProvider>,
    );
    const subtitle = interactive.getByText("동기화 중…");
    expect(subtitle.props.maxFontSizeMultiplier).toBe(1.2);
    expect(subtitle.props.numberOfLines).toBe(1);
    expect({
      maxFontSizeMultiplier: subtitle.props.maxFontSizeMultiplier,
      numberOfLines: subtitle.props.numberOfLines,
      style: StyleSheet.flatten(subtitle.props.style),
    }).toEqual(plainProps);
    // The subtitle is a sibling of the button, never inside it.
    expect(
      within(
        interactive.getByRole("button", { name: "그룹 채팅" }),
      ).queryByText("동기화 중…"),
    ).toBeNull();
  });

  test("renders no subtitle node when the subtitle is omitted or empty, with or without onPress", async () => {
    const plain = await render(
      <AppThemeProvider>
        <HeaderTitleButton subtitle="" title="그룹 채팅" />
      </AppThemeProvider>,
    );
    expect(plain.queryAllByText(/./)).toHaveLength(1);
    await plain.unmount();

    const interactive = await render(
      <AppThemeProvider>
        <HeaderTitleButton onPress={jest.fn()} title="그룹 채팅" />
      </AppThemeProvider>,
    );
    expect(interactive.queryAllByText(/./)).toHaveLength(1);
  });
});
