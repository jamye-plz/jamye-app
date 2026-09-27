import { fireEvent, render, screen } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicMediaGallery } from "@/features/media/ui/topic-media-gallery";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseChatroomGallery = jest.fn();
jest.mock("@/features/media/model/use-chatroom-gallery", () => ({
  useChatroomGallery: (chatroomId: string) =>
    mockUseChatroomGallery(chatroomId),
}));

jest.mock("@/features/media/ui/topic-media-carousel-row", () => ({
  TopicMediaCarouselRow: ({ onOpenAll }: { onOpenAll: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
    const { Text } = require("react-native");
    return <Text onPress={onOpenAll}>모두 보기</Text>;
  },
}));

// StandardStateViewErrorRow's iOS/Android files render through
// @expo/ui/swift-ui and jetpack-compose native views (label as a prop, not RN
// Text children); mock it so this section's own test can press the retry
// action without needing to also mock those native-view modules.
jest.mock("@/shared/ui/standard-state-view", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { Text, View } = require("react-native");
  return {
    StandardStateViewErrorRow: (props: {
      message: string;
      onRetry: () => void;
      testID?: string;
    }) => (
      <View testID={props.testID}>
        <Text>{props.message}</Text>
        <Text onPress={props.onRetry}>다시 시도</Text>
      </View>
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

function renderGallery() {
  return render(
    <AppThemeProvider>
      <TopicMediaGallery
        chatroomId="room-1"
        groupId="group-1"
        topicId="topic-1"
      />
    </AppThemeProvider>,
  );
}

describe("TopicMediaGallery (D4/E10 topic-detail section)", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockUseChatroomGallery.mockReset();
  });

  test("shows the loading state on first load", async () => {
    mockUseChatroomGallery.mockReturnValue({
      items: [],
      status: "loading",
      hasMore: true,
      errorMessage: null,
      loadMore: jest.fn(),
      refresh: jest.fn(),
    });
    await renderGallery();
    expect(screen.getByTestId("topic-media-gallery-loading")).toBeTruthy();
  });

  test("shows the empty guidance copy when there are no items", async () => {
    mockUseChatroomGallery.mockReturnValue({
      items: [],
      status: "idle",
      hasMore: false,
      errorMessage: null,
      loadMore: jest.fn(),
      refresh: jest.fn(),
    });
    await renderGallery();
    expect(screen.getByTestId("topic-media-gallery-empty")).toBeTruthy();
    expect(
      screen.getByText("대화방에 올린 사진과 동영상이 여기에 모여요"),
    ).toBeTruthy();
  });

  test("shows the error row with a working retry action", async () => {
    const refresh = jest.fn();
    mockUseChatroomGallery.mockReturnValue({
      items: [],
      status: "error",
      hasMore: false,
      errorMessage: "문제가 생겼어요",
      loadMore: jest.fn(),
      refresh,
    });
    await renderGallery();
    expect(screen.getByTestId("topic-media-gallery-error")).toBeTruthy();
    fireEvent.press(screen.getByText("다시 시도"));
    expect(refresh).toHaveBeenCalled();
  });

  test("renders the carousel content and navigates to the grid route on 모두 보기", async () => {
    mockUseChatroomGallery.mockReturnValue({
      items: [item("a"), item("b")],
      status: "idle",
      hasMore: true,
      errorMessage: null,
      loadMore: jest.fn(),
      refresh: jest.fn(),
    });
    await renderGallery();
    expect(screen.getByTestId("topic-media-gallery-content")).toBeTruthy();
    fireEvent.press(screen.getByText("모두 보기"));
    expect(mockPush).toHaveBeenCalledWith({
      params: { chatroomId: "room-1", groupId: "group-1", topicId: "topic-1" },
      pathname: "/groups/[groupId]/topics/[topicId]/gallery",
    });
  });
});
