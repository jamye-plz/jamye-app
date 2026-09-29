import { fireEvent, render, within } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { PlatformColor } from "react-native";
import type { Topic } from "@/core/contracts/server";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicList, topicSubtitle } from "@/features/topics/ui/topic-list";
import type { TopicListProps } from "@/features/topics/ui/topic-list.types";

// M15/AC3: topic-list.tsx now renders author rows through ActionListItem
// (swipe + context menu, @expo/ui/swift-ui) and the delete confirmation
// through ConfirmAlert (also @expo/ui/swift-ui). Combined inline mock,
// merging the established per-component patterns (tests/shared/ui/action-
// list-item.ios.test.tsx, confirm-alert.test.tsx) since both render inside
// this one screen.
jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  type MockModifier = Readonly<{ $type: string; value?: unknown }>;
  function Button(
    props: Readonly<{
      label?: string;
      modifiers?: readonly MockModifier[];
      onPress?: () => void;
      role?: string;
      systemImage?: string;
    }>,
  ) {
    const isDisabled = Boolean(
      props.modifiers?.some((modifier) => modifier.$type === "disabled"),
    );
    return (
      <Pressable
        accessibilityHint={props.role}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        accessibilityValue={
          props.modifiers?.length
            ? {
                // `JSON.stringify` (not `String`) so an object-shaped value
                // (e.g. `tint`'s `PlatformColor(...)` result) round-trips
                // into something a test can compare with `toEqual`.
                text: props.modifiers
                  .map(
                    (modifier) =>
                      `${modifier.$type}:${JSON.stringify(modifier.value)}`,
                  )
                  .join(","),
              }
            : undefined
        }
        onPress={props.onPress}
        testID={`symbol-${props.systemImage}`}
      >
        <Text>{props.label}</Text>
      </Pressable>
    );
  }
  const box = (testID: string) =>
    function MockBox({ children }: MockChildren) {
      return <View testID={testID}>{children}</View>;
    };
  const SwipeActions = box("swipe-actions") as ReturnType<typeof box> & {
    Actions: (
      props: MockChildren & { edge?: "leading" | "trailing" },
    ) => React.JSX.Element;
  };
  SwipeActions.Actions = function MockSwipeActionsGroup({
    children,
    edge = "trailing",
  }: MockChildren & { edge?: "leading" | "trailing" }) {
    return <View testID={`swipe-actions-${edge}`}>{children}</View>;
  };
  const ContextMenu = box("context-menu") as ReturnType<typeof box> & {
    Items: ReturnType<typeof box>;
    Trigger: ReturnType<typeof box>;
  };
  ContextMenu.Items = box("context-menu-items");
  ContextMenu.Trigger = box("context-menu-trigger");
  function Alert(
    props: Readonly<{
      children?: ReactNode;
      isPresented?: boolean;
      testID?: string;
      title?: string;
    }>,
  ) {
    if (!props.isPresented) return null;
    return (
      <View testID={props.testID ?? "alert"}>
        <Text accessibilityRole="header">{props.title}</Text>
        {props.children}
      </View>
    );
  }
  Alert.Trigger = box("alert-trigger");
  Alert.Actions = box("alert-actions");
  Alert.Message = box("alert-message");
  function Spacer() {
    return <View testID="spacer" />;
  }
  function MockText({ children }: MockChildren) {
    return <Text>{children}</Text>;
  }
  // LoadSentinel (load-sentinel.ios.tsx) renders these two from the same
  // module on the next-page path.
  function VStack({
    children,
    testID,
  }: MockChildren & Readonly<{ testID?: string }>) {
    return <View testID={testID}>{children}</View>;
  }
  function ProgressView() {
    return <View testID="progress-view" />;
  }
  return {
    Alert,
    Button,
    ContextMenu,
    ProgressView,
    Spacer,
    SwipeActions,
    Text: MockText,
    VStack,
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  disabled: (value: boolean) => ({ $type: "disabled", value }),
  // M15/AC3/AC5 r3: the shared ActionListItem (action-list-item.ios.tsx)
  // tints its swipe 삭제 button with the theme's error color instead of
  // giving it a destructive role. The real `tint` takes a `ShapeStyle`; on
  // iOS the caller passes `colors.error` (`PlatformColor("systemRed")`, an
  // object), not a string, so this mock echoes back whatever it's given.
  tint: (value: unknown) => ({ $type: "tint", value }),
  // LoadSentinel (also rendered by this list, see load-sentinel.ios.tsx)
  // uses these two from the same module; a full-replacement mock without
  // them crashes with "onAppear is not a function" even though this file's
  // own tests never touch it directly.
  frame: (params: unknown) => ({ $type: "frame", params }),
  onAppear: (callback: () => void) => ({ $type: "onAppear", callback }),
}));

const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "99999999-9999-4999-8999-999999999999";

const topic: Topic = {
  authorAvatarUrl: null,
  authorId: AUTHOR_ID,
  authorNickname: "작성자",
  body: null,
  chatroomId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-09-22T00:00:00Z",
  groupId: "11111111-1111-4111-8111-111111111111",
  id: "44444444-4444-4444-8444-444444444444",
  status: "seed",
  tags: [
    {
      confidence: null,
      id: "55555555-5555-4555-8555-555555555555",
      source: "user",
      tag: "여행",
      topicId: "44444444-4444-4444-8444-444444444444",
    },
  ],
  title: "오늘 이야기",
  unread: false,
  updatedAt: "2026-09-22T00:00:00Z",
};

async function setup(overrides: Partial<TopicListProps> = {}) {
  const props: TopicListProps = {
    currentUserId: null,
    loadMore: null,
    onDeleteConfirmed: jest.fn(),
    onOpenChat: jest.fn(),
    onRefresh: jest.fn().mockResolvedValue(undefined),
    topics: [topic],
    ...overrides,
  };
  const screen = await render(
    <AppThemeProvider>
      <TopicList {...props} />
    </AppThemeProvider>,
  );
  return { props, screen };
}

describe("TopicList on the shared native list and row", () => {
  test("row tap opens the chatroom and the subtitle carries author, state and tags, for every row regardless of authorship", async () => {
    const { props, screen } = await setup({ currentUserId: AUTHOR_ID });
    expect(topicSubtitle(topic)).toBe("작성자 · 새 주제 · #여행");
    expect(screen.getByText(topicSubtitle(topic))).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`topic-row-${topic.id}`));
    expect(props.onOpenChat).toHaveBeenCalledWith(topic);
  });

  test("pull-to-refresh runs through the native list", async () => {
    const { props, screen } = await setup();
    await fireEvent(screen.getByTestId("topic-list"), "refresh");
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });

  test("the auto-load sentinel row is present when there is a next page", async () => {
    const onVisible = jest.fn();
    const { screen } = await setup({
      loadMore: { isLoading: false, onVisible },
    });
    // Firing/gating semantics are LoadSentinel's own (tests/shared/ui/load-sentinel.test.tsx);
    // this only proves the list wires a next page into the auto-load row.
    expect(screen.getByTestId("topic-list-load-sentinel")).toBeTruthy();
  });

  test("no sentinel row when there is no next page", async () => {
    const { screen } = await setup({ loadMore: null });
    expect(screen.queryByTestId("topic-list-load-sentinel")).toBeNull();
  });

  describe("M15/AC3/E11: author-only delete action", () => {
    test("a non-author row (or an unresolved currentUserId) has no swipe or context-menu action", async () => {
      const { screen } = await setup({ currentUserId: OTHER_ID });
      expect(screen.queryByTestId("swipe-actions")).toBeNull();
      expect(screen.queryByTestId("context-menu")).toBeNull();
      expect(screen.queryByText("삭제")).toBeNull();

      const { screen: unknownScreen } = await setup({ currentUserId: null });
      expect(unknownScreen.queryByTestId("swipe-actions")).toBeNull();
      expect(unknownScreen.queryByText("삭제")).toBeNull();
    });

    test("an author row's swipe 삭제 uses the theme's error color as a tint, not a destructive role (so SwiftUI won't hide the row before the confirm alert runs), while the context menu keeps the destructive role", async () => {
      const { screen } = await setup({ currentUserId: AUTHOR_ID });
      const swipe = within(screen.getByTestId("swipe-actions-trailing"));
      const deleteButton = swipe.getByRole("button", { name: "삭제" });
      expect(deleteButton.props.accessibilityHint).toBeUndefined();
      // iOS `colors.error` resolves to `PlatformColor("systemRed")` --
      // coordinator review: a literal `"red"` string would have gone
      // through expo-modules-core's CSS named-color table (pure #FF0000),
      // not the system's dark-mode-aware destructive red.
      //
      // Checked via `.accessibilityValue?.text`, not the whole object: the
      // real RN `Pressable` we render through unconditionally rebuilds
      // `accessibilityValue` as `{max, min, now, text}` (coordinator check
      // run caught this -- see tests/shared/ui/action-list-item.ios.test.tsx
      // for the full explanation), so `.text` is the one field this mock
      // actually controls.
      expect(deleteButton.props.accessibilityValue?.text).toBe(
        `tint:${JSON.stringify(PlatformColor("systemRed"))}`,
      );
      const menu = within(screen.getByTestId("context-menu-items"));
      const menuDeleteButton = menu.getByRole("button", { name: "삭제" });
      expect(menuDeleteButton.props.accessibilityHint).toBe("destructive");
      expect(menu.getByTestId("symbol-trash")).toBeTruthy();
    });

    test("confirming the alert (exact E10 copy) calls onDeleteConfirmed with that row's topic", async () => {
      const { props, screen } = await setup({ currentUserId: AUTHOR_ID });
      const swipe = within(screen.getByTestId("swipe-actions-trailing"));
      await fireEvent.press(swipe.getByRole("button", { name: "삭제" }));
      // Scoped to the alert: the row's own swipe/menu "삭제" buttons stay
      // mounted underneath (this mock renders menu items eagerly), so an
      // unscoped query would match more than one "삭제"-labeled button.
      const alert = within(screen.getByTestId("topic-list-delete-confirm"));
      expect(alert.getByText("주제를 삭제할까요?")).toBeTruthy();
      expect(
        alert.getByText(
          "주제 대화방의 메시지와 사진·동영상도 모든 사람에게서 삭제됩니다.",
        ),
      ).toBeTruthy();
      await fireEvent.press(alert.getByRole("button", { name: "삭제" }));
      expect(props.onDeleteConfirmed).toHaveBeenCalledWith(topic);
    });

    test("dismissing the alert never calls onDeleteConfirmed and the row stays", async () => {
      const { props, screen } = await setup({ currentUserId: AUTHOR_ID });
      const swipe = within(screen.getByTestId("swipe-actions-trailing"));
      await fireEvent.press(swipe.getByRole("button", { name: "삭제" }));
      // Device defect (기기 검증 결함 7): a destructive-role swipe button made
      // SwiftUI hide the row the instant it was tapped, before this confirm
      // step. The row-presence checks below guard that the fix (red tint,
      // no destructive role on the swipe button) keeps the row visible both
      // while the confirm alert is open and after 취소.
      expect(screen.getByTestId(`topic-row-${topic.id}`)).toBeTruthy();
      const alert = within(screen.getByTestId("topic-list-delete-confirm"));
      await fireEvent.press(alert.getByRole("button", { name: "취소" }));
      expect(props.onDeleteConfirmed).not.toHaveBeenCalled();
      expect(screen.queryByTestId("topic-list-delete-confirm")).toBeNull();
      expect(screen.getByTestId(`topic-row-${topic.id}`)).toBeTruthy();
    });
  });
});
