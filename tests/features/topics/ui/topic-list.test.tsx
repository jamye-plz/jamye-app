import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import type { Topic } from "@/core/contracts/server";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { TopicListProps } from "@/features/topics/ui/topic-list.types";

// The default (Android) list is loaded by explicit file name because jest
// resolves the bare module to the iOS implementation.
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const methods = {
    close: () => undefined,
    openLeft: () => undefined,
    openRight: () => undefined,
    reset: () => undefined,
  };
  function MockSwipeable(
    props: Readonly<{
      children?: ReactNode;
      renderRightActions?: (
        progress: unknown,
        translation: unknown,
        swipeableMethods: typeof methods,
      ) => ReactNode;
    }>,
  ) {
    return (
      <View>
        {props.children}
        {props.renderRightActions?.({}, {}, methods)}
      </View>
    );
  }
  return { __esModule: true, default: MockSwipeable };
});

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

function loadDefaultList() {
  return jest.requireActual<{
    TopicList: (props: TopicListProps) => React.JSX.Element;
  }>("../../../../src/features/topics/ui/topic-list.tsx").TopicList;
}

async function setup(overrides: Partial<TopicListProps> = {}) {
  const TopicList = loadDefaultList();
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
  const screen = await render(
    <AppThemeProvider>
      <TopicList {...props} />
    </AppThemeProvider>,
  );
  return { props, screen };
}

describe("TopicList (Android / default): swipeable cards", () => {
  test("tap opens the chatroom and the trailing action opens the detail", async () => {
    const { props, screen } = await setup();
    await fireEvent.press(
      screen.getByRole("button", { name: "주제 오늘 이야기, 작성자 작성자" }),
    );
    expect(props.onOpenChat).toHaveBeenCalledWith(topic);
    await fireEvent.press(
      screen.getByRole("button", { name: "주제 오늘 이야기 상세" }),
    );
    expect(props.onOpenDetail).toHaveBeenCalledWith(topic);
    expect(screen.getByText("#여행")).toBeTruthy();
  });

  test("adds 삭제 to the swipe and the accessibility actions only with a delete handler", async () => {
    const onDelete = jest.fn();
    const { screen } = await setup({ onDelete });
    await fireEvent.press(
      screen.getByRole("button", { name: "주제 오늘 이야기 삭제" }),
    );
    expect(onDelete).toHaveBeenCalledWith(topic);
    const row = screen.getByRole("button", {
      name: "주제 오늘 이야기, 작성자 작성자",
    });
    expect(row.props.accessibilityActions).toEqual([
      { label: "대화방 열기", name: "activate" },
      { label: "주제 상세", name: "detail" },
      { label: "주제 삭제", name: "delete" },
    ]);
    await fireEvent(row, "accessibilityAction", {
      nativeEvent: { actionName: "delete" },
    });
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  test("exposes both actions to assistive tech without the swipe", async () => {
    const { props, screen } = await setup();
    expect(
      screen.queryByRole("button", { name: "주제 오늘 이야기 삭제" }),
    ).toBeNull();
    const row = screen.getByRole("button", {
      name: "주제 오늘 이야기, 작성자 작성자",
    });
    expect(row.props.accessibilityActions).toEqual([
      { label: "대화방 열기", name: "activate" },
      { label: "주제 상세", name: "detail" },
    ]);
    await fireEvent(row, "accessibilityAction", {
      nativeEvent: { actionName: "detail" },
    });
    expect(props.onOpenDetail).toHaveBeenCalledWith(topic);
  });

  test("shows the empty state only once the query settled and offers load more", async () => {
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
