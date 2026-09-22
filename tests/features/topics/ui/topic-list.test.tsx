import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { Topic } from "@/core/contracts/server";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicList, topicSubtitle } from "@/features/topics/ui/topic-list";
import type { TopicListProps } from "@/features/topics/ui/topic-list.types";

// The platform row affordances have their own tests; the stand-in exposes
// the row and its actions as plain buttons.
jest.mock("@/shared/ui/action-list-item", () =>
  jest
    .requireActual<typeof import("../../../support/action-list-item-mock")>(
      "../../../support/action-list-item-mock",
    )
    .createActionListItemMock(),
);

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

async function setup(overrides: Partial<TopicListProps> = {}) {
  const props: TopicListProps = {
    empty: false,
    loadMore: null,
    onOpenChat: jest.fn(),
    onOpenDetail: jest.fn(),
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
  test("tap opens the chatroom, 상세 is a row action and the subtitle carries author, state and tags", async () => {
    const { props, screen } = await setup();
    expect(topicSubtitle(topic)).toBe("작성자 · 새 주제 · #여행");
    await fireEvent.press(
      screen.getByRole("button", {
        name: `오늘 이야기, ${topicSubtitle(topic)}`,
      }),
    );
    expect(props.onOpenChat).toHaveBeenCalledWith(topic);
    await fireEvent.press(
      screen.getByRole("button", { name: "오늘 이야기 상세" }),
    );
    expect(props.onOpenDetail).toHaveBeenCalledWith(topic);
    expect(
      screen.queryByRole("button", { name: "오늘 이야기 삭제" }),
    ).toBeNull();
  });

  test("삭제 appears only once a delete handler exists", async () => {
    const onDelete = jest.fn();
    const { screen } = await setup({ onDelete });
    await fireEvent.press(
      screen.getByRole("button", { name: "오늘 이야기 삭제" }),
    );
    expect(onDelete).toHaveBeenCalledWith(topic);
  });

  test("pull-to-refresh runs through the native list and the empty / load-more rows render", async () => {
    const onPress = jest.fn();
    const { props, screen } = await setup({
      empty: true,
      loadMore: { busy: false, disabled: false, onPress },
      topics: [],
    });
    await fireEvent(screen.getByTestId("topic-list"), "refresh");
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("선택한 날짜에 주제가 없습니다.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "주제 더 보기" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
