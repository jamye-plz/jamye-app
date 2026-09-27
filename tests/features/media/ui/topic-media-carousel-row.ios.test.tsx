import { fireEvent, render } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicMediaCarouselRow } from "@/features/media/ui/topic-media-carousel-row.ios";

// topic-media-carousel-row.ios.tsx only pulls buttonStyle from swift-ui
// modifiers; Button/Host come from the bare "@expo/ui" package, which is
// already covered automatically by tests/__mocks__/@expo/ui.tsx (see that
// file's own header comment), so no explicit jest.mock("@expo/ui") call is
// needed here.
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  buttonStyle: (style: string) => ({ $type: "buttonStyle", style }),
}));

jest.mock("@/features/media/ui/chatroom-media-thumbnail", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { View } = require("react-native");
  return {
    ChatroomMediaThumbnail: ({ item }: { item: { id: string } }) => (
      <View testID={`thumb-${item.id}`} />
    ),
  };
});

function item(id: string) {
  return {
    id,
    mediaUploadId: id,
    contentType: "image/jpeg",
    byteSize: 1,
    width: 10,
    height: 10,
    duration: null,
    filename: null,
    position: 0,
    posterMediaId: null,
    messageId: "message-1",
    messageCreatedAt: "2026-09-10T00:00:00Z",
  };
}

describe("TopicMediaCarouselRow (iOS)", () => {
  test("renders one ChatroomMediaThumbnail per item", async () => {
    const { getByTestId } = await render(
      <AppThemeProvider>
        <TopicMediaCarouselRow
          items={[item("a"), item("b")]}
          onOpenAll={jest.fn()}
        />
      </AppThemeProvider>,
    );
    expect(getByTestId("thumb-a")).toBeTruthy();
    expect(getByTestId("thumb-b")).toBeTruthy();
  });

  test("모두 보기 opens the grid", async () => {
    const onOpenAll = jest.fn();
    const { getByText } = await render(
      <AppThemeProvider>
        <TopicMediaCarouselRow items={[item("a")]} onOpenAll={onOpenAll} />
      </AppThemeProvider>,
    );
    await fireEvent.press(getByText("모두 보기"));
    expect(onOpenAll).toHaveBeenCalledTimes(1);
  });
});
