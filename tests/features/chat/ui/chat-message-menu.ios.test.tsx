import { fireEvent, render, within } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { Text } from "react-native";

import { ChatMessageMenu } from "@/features/chat/ui/chat-message-menu.ios";
import type { ChatMessageMenuAction } from "@/features/chat/ui/chat-message-menu.types";

// Mirrors `tests/shared/ui/action-list-item.ios.test.tsx`'s inline
// `@expo/ui/swift-ui` mock shape (`Button`, `ContextMenu` +
// `.Trigger`/`.Items`); `@expo/ui`'s root `Host`/`RNHostView` come from the
// shared manual mock (`tests/__mocks__/@expo/ui.tsx`), picked up
// automatically.
jest.mock("@expo/ui/swift-ui", () => {
  const {
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Button(
    props: Readonly<{
      label?: string;
      onPress?: () => void;
      role?: string;
      systemImage?: string;
    }>,
  ) {
    return (
      <Pressable
        accessibilityHint={props.role}
        accessibilityRole="button"
        onPress={props.onPress}
        testID={`symbol-${props.systemImage}`}
      >
        <RNText>{props.label}</RNText>
      </Pressable>
    );
  }
  const box = (testID: string) =>
    function MockBox({ children }: MockChildren) {
      return <View testID={testID}>{children}</View>;
    };
  const ContextMenu = box("context-menu") as ReturnType<typeof box> & {
    Items: ReturnType<typeof box>;
    Trigger: ReturnType<typeof box>;
  };
  ContextMenu.Items = box("context-menu-items");
  ContextMenu.Trigger = box("context-menu-trigger");
  return { Button, ContextMenu };
});

function action(
  overrides: Partial<ChatMessageMenuAction>,
): ChatMessageMenuAction {
  return {
    key: "copy",
    label: "복사",
    onPress: jest.fn(),
    ...overrides,
  };
}

describe("ChatMessageMenu (iOS, R2)", () => {
  test("renders the bubble alone with no ContextMenu host when there are no actions", async () => {
    const screen = await render(
      <ChatMessageMenu actions={[]} alignEnd={false}>
        <Text>bubble</Text>
      </ChatMessageMenu>,
    );

    expect(screen.getByText("bubble")).toBeTruthy();
    expect(screen.queryByTestId("context-menu")).toBeNull();
  });

  test("wraps the bubble in a ContextMenu.Trigger and lists every action as a swift-ui Button", async () => {
    const copy = action({ key: "copy", label: "복사" });
    const share = action({ key: "save-share", label: "저장·공유" });
    const retry = action({ key: "retry", label: "다시 보내기" });
    const screen = await render(
      <ChatMessageMenu actions={[copy, share, retry]} alignEnd>
        <Text>bubble</Text>
      </ChatMessageMenu>,
    );

    const trigger = within(screen.getByTestId("context-menu-trigger"));
    expect(trigger.getByText("bubble")).toBeTruthy();

    const items = within(screen.getByTestId("context-menu-items"));
    await fireEvent.press(items.getByRole("button", { name: "복사" }));
    expect(copy.onPress).toHaveBeenCalledTimes(1);
    expect(share.onPress).not.toHaveBeenCalled();

    await fireEvent.press(items.getByRole("button", { name: "저장·공유" }));
    expect(share.onPress).toHaveBeenCalledTimes(1);

    await fireEvent.press(items.getByRole("button", { name: "다시 보내기" }));
    expect(retry.onPress).toHaveBeenCalledTimes(1);
  });

  test("only includes the 다시 보내기 action when the caller supplies it (failed sends)", async () => {
    const screen = await render(
      <ChatMessageMenu
        actions={[action({ key: "copy", label: "복사" })]}
        alignEnd
      >
        <Text>bubble</Text>
      </ChatMessageMenu>,
    );

    const items = within(screen.getByTestId("context-menu-items"));
    expect(items.queryByRole("button", { name: "다시 보내기" })).toBeNull();
  });
});
