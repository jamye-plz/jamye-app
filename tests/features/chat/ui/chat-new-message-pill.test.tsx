import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { ChatNewMessagePill } from "@/features/chat/ui/chat-new-message-pill";

describe("ChatNewMessagePill (R4)", () => {
  test("renders an accessible button that calls onPress once tapped", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <AppThemeProvider>
        <ChatNewMessagePill onPress={onPress} />
      </AppThemeProvider>,
    );

    const button = screen.getByRole("button", {
      name: "새 메시지, 눌러서 맨 아래로 이동",
    });
    await fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("shows the 새 메시지 label", async () => {
    const screen = await render(
      <AppThemeProvider>
        <ChatNewMessagePill onPress={() => undefined} />
      </AppThemeProvider>,
    );

    expect(screen.getByText("새 메시지")).toBeTruthy();
  });
});
