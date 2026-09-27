import { render } from "@testing-library/react-native";

import type { TopicTag } from "@/core/contracts/server";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicTagsView } from "@/features/topics/ui/topic-tags-view";
import { TopicTagsView as IosTopicTagsView } from "@/features/topics/ui/topic-tags-view.ios";

const tags: readonly TopicTag[] = [
  {
    confidence: null,
    id: "55555555-5555-4555-8555-555555555555",
    source: "user",
    tag: "여행",
    topicId: "44444444-4444-4444-8444-444444444444",
  },
  {
    confidence: null,
    id: "66666666-6666-4666-8666-666666666666",
    source: "ai",
    tag: "맛집",
    topicId: "44444444-4444-4444-8444-444444444444",
  },
];

describe("TopicTagsView (fallback and iOS)", () => {
  test.each([
    ["fallback", TopicTagsView],
    ["iOS", IosTopicTagsView],
  ])(
    "%s renders one horizontal capsule label per tag (D3)",
    async (_name, Component) => {
      const screen = await render(
        <AppThemeProvider>
          <Component tags={tags} testID="tags-view" />
        </AppThemeProvider>,
      );
      expect(screen.getByText("#여행")).toBeTruthy();
      expect(screen.getByText("#맛집")).toBeTruthy();
    },
  );

  test.each([
    ["fallback", TopicTagsView],
    ["iOS", IosTopicTagsView],
  ])("%s shows 태그 없음 for an empty tag set", async (_name, Component) => {
    const screen = await render(
      <AppThemeProvider>
        <Component tags={[]} testID="tags-view" />
      </AppThemeProvider>,
    );
    expect(screen.getByText("태그 없음")).toBeTruthy();
  });
});
