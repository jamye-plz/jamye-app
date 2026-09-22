import { fireEvent, render, within } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import type { Topic } from "@/core/contracts/server";
import { TopicList } from "@/features/topics/ui/topic-list.ios";
import type { TopicListProps } from "@/features/topics/ui/topic-list.types";

const mockModifier = jest.fn((name: string, arg?: unknown) => ({ arg, name }));

jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Host: ({ children }: Readonly<{ children?: ReactNode }>) => (
      <View testID="swiftui-host">{children}</View>
    ),
  };
});
jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  const Box = ({ children }: MockChildren) => <View>{children}</View>;
  function Button(
    props: Readonly<{
      children?: ReactNode;
      label?: string;
      onPress?: () => void;
      role?: string;
      systemImage?: string;
    }>,
  ) {
    return (
      <Pressable
        accessibilityHint={props.role}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        onPress={props.onPress}
      >
        {props.children}
      </Pressable>
    );
  }
  function SwipeActions({ children }: MockChildren) {
    return <View testID="swipe-actions">{children}</View>;
  }
  function SwipeActionsEdge({
    allowsFullSwipe,
    children,
    edge,
  }: Readonly<{
    allowsFullSwipe?: boolean;
    children?: ReactNode;
    edge?: string;
  }>) {
    return (
      <View
        accessibilityState={{ disabled: allowsFullSwipe === false }}
        testID={`swipe-actions-${edge}`}
      >
        {children}
      </View>
    );
  }
  SwipeActions.Actions = SwipeActionsEdge;
  return {
    Button,
    ContentUnavailableView: ({ title }: Readonly<{ title?: string }>) => (
      <Text>{title}</Text>
    ),
    HStack: Box,
    List: Box,
    Section: Box,
    Spacer: () => null,
    SwipeActions,
    Text: ({ children }: MockChildren) => <Text>{children}</Text>,
    VStack: Box,
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  buttonStyle: (style: string) => mockModifier("buttonStyle", style),
  disabled: (value?: boolean) => mockModifier("disabled", value),
  font: (params: unknown) => mockModifier("font", params),
  listStyle: (style: string) => mockModifier("listStyle", style),
  opacity: (value: number) => mockModifier("opacity", value),
  refreshable: (handler: unknown) => mockModifier("refreshable", handler),
}));

const topic: Topic = {
  authorAvatarUrl: null,
  authorId: "22222222-2222-4222-8222-222222222222",
  authorNickname: "작성자",
  body: null,
  chatroomId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-09-22T00:00:00Z",
  groupId: "11111111-1111-4111-8111-111111111111",
  id: "44444444-4444-4444-8444-444444444444",
  media: [],
  status: "enriched",
  tags: [],
  title: "오늘 이야기",
  unread: false,
  updatedAt: "2026-09-22T00:00:00Z",
};

async function setup(overrides: Partial<TopicListProps> = {}) {
  const props: TopicListProps = {
    empty: false,
    loadMore: null,
    onOpenChat: jest.fn(),
    onOpenDetail: jest.fn(),
    onRefresh: jest.fn().mockResolvedValue(undefined),
    refreshing: false,
    topics: [topic],
    ...overrides,
  };
  const screen = await render(<TopicList {...props} />);
  return { props, screen };
}

describe("TopicList (iOS): SwiftUI List with native swipe actions", () => {
  beforeEach(() => mockModifier.mockClear());

  test("renders rows in an inset-grouped refreshable List and taps open the chatroom", async () => {
    const { props, screen } = await setup();
    expect(screen.getByTestId("swiftui-host")).toBeTruthy();
    expect(mockModifier).toHaveBeenCalledWith("listStyle", "insetGrouped");
    expect(mockModifier).toHaveBeenCalledWith("refreshable", props.onRefresh);
    expect(mockModifier).toHaveBeenCalledWith("buttonStyle", "plain");
    expect(screen.getByText("작성자 · 이야기 있음")).toBeTruthy();
    await fireEvent.press(screen.getByText("오늘 이야기"));
    expect(props.onOpenChat).toHaveBeenCalledWith(topic);
  });

  test("the trailing swipe shows 상세 only until a delete handler exists", async () => {
    const { props, screen } = await setup();
    const actions = screen.getByTestId("swipe-actions-trailing");
    expect(actions.props.accessibilityState).toEqual({ disabled: true });
    expect(
      within(actions)
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel),
    ).toEqual(["상세"]);
    await fireEvent.press(screen.getByRole("button", { name: "상세" }));
    expect(props.onOpenDetail).toHaveBeenCalledWith(topic);
  });

  test("with a delete handler the destructive 삭제 sits at the edge before 상세", async () => {
    const onDelete = jest.fn();
    const { screen } = await setup({ onDelete });
    const actions = screen.getByTestId("swipe-actions-trailing");
    const buttons = within(actions).getAllByRole("button");
    expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
      "삭제",
      "상세",
    ]);
    expect(buttons[0]?.props.accessibilityHint).toBe("destructive");
    await fireEvent.press(buttons[0]!);
    expect(onDelete).toHaveBeenCalledWith(topic);
  });

  test("shows the unavailable view when empty and a load-more row when paginated", async () => {
    const onPress = jest.fn();
    const { screen } = await setup({
      empty: true,
      loadMore: { busy: false, disabled: false, onPress },
      topics: [],
    });
    expect(screen.getByText("선택한 날짜에 주제가 없습니다.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "주제 더 보기" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
