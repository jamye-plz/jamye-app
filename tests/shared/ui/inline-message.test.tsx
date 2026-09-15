import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { InlineMessage } from "@/shared/ui/inline-message";

describe("InlineMessage", () => {
  test("renders an assertive alert for kind=error", async () => {
    const screen = await render(
      <AppThemeProvider>
        <InlineMessage kind="error" message="전송에 실패했습니다." />
      </AppThemeProvider>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.props.accessibilityLiveRegion).toBe("assertive");
    expect(screen.getByText("전송에 실패했습니다.")).toBeTruthy();
  });

  test("renders a polite live region for the default notice kind", async () => {
    const screen = await render(
      <AppThemeProvider>
        <InlineMessage message="로컬 저장소를 사용 중입니다." testID="notice" />
      </AppThemeProvider>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    const notice = screen.getByTestId("notice");
    expect(notice.props.accessibilityLiveRegion).toBe("polite");
  });

  test("renders optional children below the message", async () => {
    const screen = await render(
      <AppThemeProvider>
        <InlineMessage kind="error" message="문제가 발생했습니다.">
          <Text>다시 시도</Text>
        </InlineMessage>
      </AppThemeProvider>,
    );
    expect(screen.getByText("다시 시도")).toBeTruthy();
  });
});
