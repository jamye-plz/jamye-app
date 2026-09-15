import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { GroupedSection } from "@/shared/ui/grouped-section";

describe("GroupedSection", () => {
  test("renders an accessible header when title is provided", async () => {
    const screen = await render(
      <AppThemeProvider>
        <GroupedSection title="설정">
          <Text>Row</Text>
        </GroupedSection>
      </AppThemeProvider>,
    );
    expect(screen.getByRole("header", { name: "설정" })).toBeTruthy();
  });

  test("renders one hairline separator fewer than the number of children", async () => {
    const screen = await render(
      <AppThemeProvider>
        <GroupedSection>
          <Text>One</Text>
          <Text>Two</Text>
          <Text>Three</Text>
        </GroupedSection>
      </AppThemeProvider>,
    );
    expect(screen.getAllByTestId("grouped-section-divider")).toHaveLength(2);
  });

  test("renders footer text when provided", async () => {
    const screen = await render(
      <AppThemeProvider>
        <GroupedSection footer="도움말 문구">
          <Text>Row</Text>
        </GroupedSection>
      </AppThemeProvider>,
    );
    expect(screen.getByText("도움말 문구")).toBeTruthy();
  });
});
