import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@expo/ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { Pressable, Text, View } = require("react-native");
  return {
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    Host: ({
      children,
      matchContents,
    }: {
      children?: React.ReactNode;
      matchContents?: unknown;
    }) => (
      <View {...{ matchContents }} testID="carousel-host">
        {children}
      </View>
    ),
  };
});

jest.mock("@expo/ui/jetpack-compose", () => ({
  HorizontalMultiBrowseCarousel: ({
    children,
  }: {
    children?: React.ReactNode;
  }) => <>{children}</>,
  RNHostView: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/features/media/ui/chatroom-media-thumbnail", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { View } = require("react-native");
  return {
    ChatroomMediaThumbnail: ({
      fill,
      item,
    }: {
      fill?: boolean;
      item: { id: string };
    }) => <View testID={`thumb-${item.id}`} {...{ fill }} />,
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

describe("TopicMediaCarouselRow (android/default direct require)", () => {
  test("renders one thumbnail per item inside the Compose HorizontalMultiBrowseCarousel", async () => {
    const { TopicMediaCarouselRow } = jest.requireActual(
      "@/features/media/ui/topic-media-carousel-row.tsx",
    );
    const { getByTestId } = await render(
      <TopicMediaCarouselRow
        items={[item("a"), item("b")]}
        onOpenAll={jest.fn()}
      />,
    );
    expect(getByTestId("thumb-a")).toBeTruthy();
    expect(getByTestId("thumb-b")).toBeTruthy();
    // Items narrow as they scroll; thumbnails fill the item, not a square.
    expect(getByTestId("thumb-a").props.fill).toBe(true);
  });

  test("hosts the carousel at the row width: a horizontal matchContents measures the pager unbounded and crashes Compose", async () => {
    const { TopicMediaCarouselRow } = jest.requireActual(
      "@/features/media/ui/topic-media-carousel-row.tsx",
    );
    const { getAllByTestId } = await render(
      <TopicMediaCarouselRow items={[item("a")]} onOpenAll={jest.fn()} />,
    );
    // The first host is the carousel's (the 모두 보기 button has its own).
    expect(getAllByTestId("carousel-host")[0]!.props.matchContents).toEqual({
      vertical: true,
    });
  });

  test("모두 보기 opens the grid", async () => {
    const { TopicMediaCarouselRow } = jest.requireActual(
      "@/features/media/ui/topic-media-carousel-row.tsx",
    );
    const onOpenAll = jest.fn();
    const { getByText } = await render(
      <TopicMediaCarouselRow items={[item("a")]} onOpenAll={onOpenAll} />,
    );
    await fireEvent.press(getByText("모두 보기"));
    expect(onOpenAll).toHaveBeenCalledTimes(1);
  });
});
