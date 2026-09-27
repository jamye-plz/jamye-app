import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { ChatroomMediaGridScreen } from "@/features/media/ui/chatroom-media-grid-screen";

const mockUseChatroomGallery = jest.fn();
jest.mock("@/features/media/model/use-chatroom-gallery", () => ({
  useChatroomGallery: (chatroomId: string) =>
    mockUseChatroomGallery(chatroomId),
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

// The state views are SwiftUI/Compose nodes; the screen must give them a
// Host (outside one Android draws nothing). The marker makes that checkable.
jest.mock("@expo/ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { View } = require("react-native");
  return {
    Host: ({ children }: { children?: React.ReactNode }) => (
      <View testID="state-host">{children}</View>
    ),
  };
});

// StandardStateView's iOS/Android files render through @expo/ui/swift-ui and
// jetpack-compose native views (label as a prop, not RN Text children), which
// need per-test inline mocking of THOSE modules to be interactive -- out of
// scope for this screen's own test, which only needs to prove it passes the
// right kind/testID/actions through. standard-state-view.test.tsx covers the
// real rendering.
jest.mock("@/shared/ui/standard-state-view", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { Text, View } = require("react-native");
  return {
    StandardStateView: (props: {
      kind: "loading" | "empty" | "error";
      testID?: string;
      title?: string;
      actions?: readonly { label: string; onPress: () => void }[];
    }) => (
      <View testID={props.testID}>
        {props.title ? <Text>{props.title}</Text> : null}
        {props.actions?.map((action) => (
          <Text key={action.label} onPress={action.onPress}>
            {action.label}
          </Text>
        ))}
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

function renderGrid() {
  return render(
    <AppThemeProvider>
      <ChatroomMediaGridScreen chatroomId="room-1" />
    </AppThemeProvider>,
  );
}

describe("ChatroomMediaGridScreen (D4 3-column gallery grid)", () => {
  beforeEach(() => {
    mockUseChatroomGallery.mockReset();
  });

  test("shows the loading state", async () => {
    mockUseChatroomGallery.mockReturnValue({
      items: [],
      status: "loading",
      hasMore: true,
      errorMessage: null,
      loadMore: jest.fn(),
      refresh: jest.fn(),
    });
    await renderGrid();
    expect(
      within(screen.getByTestId("state-host")).getByTestId(
        "chatroom-media-grid-loading",
      ),
    ).toBeTruthy();
  });

  test("shows the empty state", async () => {
    mockUseChatroomGallery.mockReturnValue({
      items: [],
      status: "idle",
      hasMore: false,
      errorMessage: null,
      loadMore: jest.fn(),
      refresh: jest.fn(),
    });
    await renderGrid();
    expect(
      within(screen.getByTestId("state-host")).getByTestId(
        "chatroom-media-grid-empty",
      ),
    ).toBeTruthy();
  });

  test("shows the error state with a working retry action", async () => {
    const refresh = jest.fn();
    mockUseChatroomGallery.mockReturnValue({
      items: [],
      status: "error",
      hasMore: false,
      errorMessage: "문제",
      loadMore: jest.fn(),
      refresh,
    });
    await renderGrid();
    expect(screen.getByTestId("chatroom-media-grid-error")).toBeTruthy();
    fireEvent.press(screen.getByText("다시 시도"));
    expect(refresh).toHaveBeenCalled();
  });

  test("renders every item as a thumbnail in the virtualized 3-column grid", async () => {
    mockUseChatroomGallery.mockReturnValue({
      items: [item("a"), item("b"), item("c")],
      status: "idle",
      hasMore: true,
      errorMessage: null,
      loadMore: jest.fn(),
      refresh: jest.fn(),
    });
    await renderGrid();
    expect(screen.getByTestId("chatroom-media-grid-list")).toBeTruthy();
    expect(screen.getByTestId("thumb-a")).toBeTruthy();
    expect(screen.getByTestId("thumb-b")).toBeTruthy();
    expect(screen.getByTestId("thumb-c")).toBeTruthy();
  });
});
