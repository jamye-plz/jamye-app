import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { EmptyState } from "@/shared/ui/empty-state";

describe("EmptyState", () => {
  test("renders the title with an accessible header role", async () => {
    const screen = await render(
      <AppThemeProvider>
        <EmptyState title="그룹이 없습니다" />
      </AppThemeProvider>,
    );
    expect(
      screen.getByRole("header", { name: "그룹이 없습니다" }),
    ).toBeTruthy();
  });

  test("renders an optional description", async () => {
    const screen = await render(
      <AppThemeProvider>
        <EmptyState
          description="새 주제를 만들어보세요."
          title="주제가 없습니다"
        />
      </AppThemeProvider>,
    );
    expect(screen.getByText("새 주제를 만들어보세요.")).toBeTruthy();
  });

  test("renders an optional action slot via children", async () => {
    const screen = await render(
      <AppThemeProvider>
        <EmptyState title="빈 목록">
          <Text>새로 만들기</Text>
        </EmptyState>
      </AppThemeProvider>,
    );
    expect(screen.getByText("새로 만들기")).toBeTruthy();
  });
});
