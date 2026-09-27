import { render } from "@testing-library/react-native";

const mockUseLocalSearchParams = jest.fn();
jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { View } = require("react-native");
  return {
    useLocalSearchParams: () => mockUseLocalSearchParams(),
    Stack: { Screen: () => <View testID="gallery-stack-screen" /> },
  };
});

const mockChatroomMediaGridScreen = jest.fn();
jest.mock("@/features/media/ui/chatroom-media-grid-screen", () => ({
  ChatroomMediaGridScreen: (props: { chatroomId: string }) => {
    mockChatroomMediaGridScreen(props);
    return null;
  },
}));

// eslint-disable-next-line import/first
import GalleryRoute from "@/app/groups/[groupId]/topics/[topicId]/gallery";

describe("D4 gallery route", () => {
  beforeEach(() => {
    mockChatroomMediaGridScreen.mockClear();
  });

  test("passes chatroomId from the query param down to the grid screen", async () => {
    mockUseLocalSearchParams.mockReturnValue({
      groupId: "group-1",
      topicId: "topic-1",
      chatroomId: "room-1",
    });
    await render(<GalleryRoute />);
    expect(mockChatroomMediaGridScreen).toHaveBeenCalledWith({
      chatroomId: "room-1",
    });
  });

  test("renders no grid screen while chatroomId is missing from params", async () => {
    mockUseLocalSearchParams.mockReturnValue({
      groupId: "group-1",
      topicId: "topic-1",
    });
    await render(<GalleryRoute />);
    expect(mockChatroomMediaGridScreen).not.toHaveBeenCalled();
  });
});
