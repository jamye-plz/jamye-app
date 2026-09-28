import { fireEvent, render, within } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { Text } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { ChatMessageMenuAction } from "@/features/chat/ui/chat-message-menu.types";

// Mirrors `tests/shared/ui/action-list-item.android.test.tsx`'s inline
// `@expo/ui/jetpack-compose` mock. `@expo/ui`'s root `Host`/`RNHostView`
// come from the shared manual mock, picked up automatically.
jest.mock("@expo/ui/jetpack-compose", () => {
  const {
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function DropdownMenu(
    props: Readonly<{ children?: ReactNode; expanded?: boolean }>,
  ) {
    return (
      <View
        accessibilityState={{ expanded: Boolean(props.expanded) }}
        testID="dropdown-menu"
      >
        {props.children}
      </View>
    );
  }
  function MockSlot({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  DropdownMenu.Trigger = MockSlot;
  DropdownMenu.Items = MockSlot;
  function DropdownMenuItem(
    props: Readonly<{ children?: ReactNode; onClick?: () => void }>,
  ) {
    return (
      <Pressable accessibilityRole="menuitem" onPress={props.onClick}>
        {props.children}
      </Pressable>
    );
  }
  DropdownMenuItem.Text = MockSlot;
  function ComposeText(props: Readonly<{ children?: string }>) {
    return <RNText>{props.children}</RNText>;
  }
  return { Box: MockSlot, DropdownMenu, DropdownMenuItem, Text: ComposeText };
});

function loadAndroidChatMessageMenu(): typeof import("@/features/chat/ui/chat-message-menu.android") {
  return jest.requireActual(
    "../../../../src/features/chat/ui/chat-message-menu.android",
  );
}

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

describe("ChatMessageMenu (Android, R2)", () => {
  test("renders the bubble alone with no DropdownMenu host when there are no actions", async () => {
    const { ChatMessageMenu } = loadAndroidChatMessageMenu();
    const screen = await render(
      <AppThemeProvider>
        <ChatMessageMenu actions={[]} alignEnd={false}>
          <Text>bubble</Text>
        </ChatMessageMenu>
      </AppThemeProvider>,
    );

    expect(screen.getByText("bubble")).toBeTruthy();
    expect(screen.queryByTestId("dropdown-menu")).toBeNull();
  });

  test("opens the anchored DropdownMenu on a long press of the bubble and runs the tapped action", async () => {
    const { ChatMessageMenu } = loadAndroidChatMessageMenu();
    const save = action({ key: "save-share", label: "저장·공유" });
    const screen = await render(
      <AppThemeProvider>
        <ChatMessageMenu actions={[save]} alignEnd={false}>
          <Text>bubble</Text>
        </ChatMessageMenu>
      </AppThemeProvider>,
    );

    // No native host per row until the menu opens.
    expect(screen.queryByTestId("dropdown-menu")).toBeNull();

    await fireEvent(screen.getByText("bubble"), "longPress");
    expect(
      screen.getByTestId("dropdown-menu").props.accessibilityState.expanded,
    ).toBe(true);
    // The bubble stays outside the Compose host: React Native touches did
    // not reach a bubble hosted inside it on device.
    expect(
      within(screen.getByTestId("chat-message-menu-anchor")).queryByText(
        "bubble",
      ),
    ).toBeNull();

    await fireEvent.press(screen.getByRole("menuitem", { name: "저장·공유" }));
    expect(save.onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("dropdown-menu")).toBeNull();
  });
});
