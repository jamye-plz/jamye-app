import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { Topic } from "@/core/contracts/server";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicList, topicSubtitle } from "@/features/topics/ui/topic-list";
import type { TopicListProps } from "@/features/topics/ui/topic-list.types";

const topic: Topic = {
  authorAvatarUrl: null,
  authorId: "22222222-2222-4222-8222-222222222222",
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
    loadMore: null,
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
  test("row tap opens the chatroom and the subtitle carries author, state and tags -- no other row action", async () => {
    const { props, screen } = await setup();
    expect(topicSubtitle(topic)).toBe("작성자 · 새 주제 · #여행");
    expect(screen.getByText(topicSubtitle(topic))).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`topic-row-${topic.id}`));
    expect(props.onOpenChat).toHaveBeenCalledWith(topic);
    expect(screen.queryByText("상세")).toBeNull();
    expect(screen.queryByText("삭제")).toBeNull();
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
});
