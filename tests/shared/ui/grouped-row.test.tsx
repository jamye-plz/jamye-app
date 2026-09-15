import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { lightTheme } from "@/core/theme/tokens";
import { GroupedRow } from "@/shared/ui/grouped-row";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

describe("GroupedRow", () => {
  test("renders as a button with a default accessibility label built from title and subtitle, and fires onPress", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <AppThemeProvider>
        <GroupedRow onPress={onPress} subtitle="3 / 5명" title="그룹 이름" />
      </AppThemeProvider>,
    );
    const row = screen.getByRole("button", { name: "그룹 이름, 3 / 5명" });
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("is not a button when onPress is not provided", async () => {
    const screen = await render(
      <AppThemeProvider>
        <GroupedRow title="정적 행" />
      </AppThemeProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("정적 행")).toBeTruthy();
  });

  test("reflects disabled, busy, and selected in accessibilityState", async () => {
    const screen = await render(
      <AppThemeProvider>
        <GroupedRow busy disabled onPress={jest.fn()} selected title="설정" />
      </AppThemeProvider>,
    );
    const row = screen.getByRole("button", { name: "설정" });
    expect(row.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true, selected: true }),
    );
  });

  test("uses the error color for a destructive row", async () => {
    const screen = await render(
      <AppThemeProvider>
        <GroupedRow destructive onPress={jest.fn()} title="그룹 삭제" />
      </AppThemeProvider>,
    );
    const title = screen.getByText("그룹 삭제");
    const flattenedStyle = [title.props.style].flat();
    expect(flattenedStyle).toContainEqual(
      expect.objectContaining({ color: lightTheme.colors.error }),
    );
  });

  test("shows a chevron on ios when pressable by default and hides it when chevron is false", async () => {
    const pressableScreen = await render(
      <AppThemeProvider>
        <GroupedRow onPress={jest.fn()} title="행" />
      </AppThemeProvider>,
    );
    expect(
      pressableScreen.queryAllByTestId("grouped-row-chevron"),
    ).toHaveLength(1);

    const noChevronScreen = await render(
      <AppThemeProvider>
        <GroupedRow chevron={false} onPress={jest.fn()} title="행" />
      </AppThemeProvider>,
    );
    expect(
      noChevronScreen.queryAllByTestId("grouped-row-chevron"),
    ).toHaveLength(0);
  });
});
