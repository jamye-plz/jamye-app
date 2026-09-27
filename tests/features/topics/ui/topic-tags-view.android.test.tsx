import { render } from "@testing-library/react-native";
import type { ReactNode } from "react";

import type { TopicTag } from "@/core/contracts/server";

jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Host: ({
      children,
      matchContents,
      testID,
    }: {
      children?: ReactNode;
      matchContents?: unknown;
      testID?: string;
    }) => (
      <View {...{ matchContents }} testID={testID}>
        {children}
      </View>
    ),
  };
});
jest.mock("@expo/ui/jetpack-compose", () => {
  const { Text: RNText, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function FlowRow({ children }: { children?: ReactNode }) {
    return <View>{children}</View>;
  }
  function SuggestionChip({ children }: { children?: ReactNode }) {
    return <View>{children}</View>;
  }
  SuggestionChip.Label = function SuggestionChipLabel({
    children,
  }: {
    children?: ReactNode;
  }) {
    return <View>{children}</View>;
  };
  function Text({
    children,
    color,
  }: {
    children?: ReactNode;
    color?: unknown;
  }) {
    return <RNText {...{ color }}>{children}</RNText>;
  }
  return { FlowRow, SuggestionChip, Text };
});

// eslint-disable-next-line import/first -- must follow the jest.mock calls above
import { TopicTagsView } from "@/features/topics/ui/topic-tags-view.android";

const tags: readonly TopicTag[] = [
  {
    confidence: null,
    id: "55555555-5555-4555-8555-555555555555",
    source: "user",
    tag: "여행",
    topicId: "44444444-4444-4444-8444-444444444444",
  },
];

describe("TopicTagsView (Android)", () => {
  test("D3: renders a FlowRow of SuggestionChips, one per tag", async () => {
    const screen = await render(
      <TopicTagsView tags={tags} testID="tags-view" />,
    );
    expect(screen.getByText("#여행")).toBeTruthy();
  });

  test("sizes the host to the row width so FlowRow wraps (vertical-only matchContents)", async () => {
    const screen = await render(
      <TopicTagsView tags={tags} testID="tags-view" />,
    );
    expect(screen.getByTestId("tags-view").props.matchContents).toEqual({
      vertical: true,
    });
  });

  test("shows 태그 없음 for an empty tag set", async () => {
    const screen = await render(<TopicTagsView tags={[]} testID="tags-view" />);
    expect(screen.getByText("태그 없음")).toBeTruthy();
  });
});
