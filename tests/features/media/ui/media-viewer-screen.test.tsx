import { act, fireEvent, render } from "@testing-library/react-native";
import { Dimensions } from "react-native";

// Focus reaches the viewer after its first render, as on device: callbacks
// only run when a test calls `mockFocusScreen()`.
let mockFocusCallbacks: (() => void)[] = [];
let mockScreenFocused = false;
function mockFocusScreen() {
  mockScreenFocused = true;
  for (const callback of mockFocusCallbacks) callback();
}
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocusCallbacks.push(callback);
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView:
    jest.requireActual<typeof import("react-native")>("react-native").View,
}));

const mockCloseMediaViewer = jest.fn();
let mockParams: unknown = null;
const mockClearMediaViewer = jest.fn();
jest.mock("@/features/media/ui/media-viewer-store", () => ({
  clearMediaViewer: (...args: unknown[]) => mockClearMediaViewer(...args),
  closeMediaViewer: (...args: unknown[]) => mockCloseMediaViewer(...args),
  useMediaViewerParams: () => mockParams,
}));

const mockImageSourceState = jest.fn();
jest.mock("@/features/media/ui/media-image", () => ({
  useMediaImageSource: (...args: unknown[]) => mockImageSourceState(...args),
}));

const mockUseMediaVideo = jest.fn();
jest.mock("@/features/media/ui/use-media-video", () => ({
  useMediaVideo: (...args: unknown[]) => mockUseMediaVideo(...args),
}));

const mockShareAttachment = jest.fn();
jest.mock("@/features/media/model/media-sharing", () => ({
  useMediaSharing: () => ({
    shareAttachment: mockShareAttachment,
    busy: false,
    status: "idle",
    errorMessage: null,
    available: true,
  }),
}));

jest.mock("@/features/media/platform/native-video-player", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    NativeVideoPlayer: (props: Readonly<{ statusColor?: string }>) => (
      <View testID="native-video-player" {...props} />
    ),
  };
});

import { MediaViewerScreen } from "@/features/media/ui/media-viewer-screen";

const photo = {
  id: "photo-1",
  type: "image/jpeg",
  filename: "a.jpg",
  width: 100,
  height: 100,
  duration: null,
  posterMediaId: null,
  position: 0,
};
const video = {
  id: "video-1",
  type: "video/mp4",
  filename: "b.mp4",
  width: 100,
  height: 100,
  duration: null,
  posterMediaId: null,
  position: 1,
};

beforeEach(() => {
  mockCloseMediaViewer.mockReset();
  mockClearMediaViewer.mockReset();
  mockShareAttachment.mockReset();
  mockImageSourceState.mockReset().mockReturnValue({
    state: { status: "ready", uri: "file:///tmp/a.jpg" },
    retry: jest.fn(),
    canRetry: true,
  });
  mockUseMediaVideo.mockReset().mockReturnValue({
    state: { status: "idle" },
    available: true,
    open: jest.fn(),
    close: jest.fn(),
    playbackFailed: jest.fn(),
  });
  mockParams = {
    messageId: "message-1",
    attachments: [photo, video],
    startIndex: 0,
  };
});

test("closes itself when opened with no params (e.g. a cold deep-link)", async () => {
  mockParams = null;
  await render(<MediaViewerScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockCloseMediaViewer).toHaveBeenCalledTimes(1);
});

test("shows the starting index as n / N and closes on the close button", async () => {
  mockParams = {
    messageId: "message-1",
    attachments: [photo, video],
    startIndex: 1,
  };
  const screen = await render(<MediaViewerScreen />);
  expect(screen.getByText("2 / 2")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("닫기"));
  expect(mockCloseMediaViewer).toHaveBeenCalledTimes(1);
});

test("closing pops the viewer exactly once, even when the params clear under it", async () => {
  // Device: the store cleared on close, the still-mounted viewer re-rendered
  // without params, and its no-params guard popped the chat screen too.
  const screen = await render(<MediaViewerScreen />);
  await fireEvent.press(screen.getByLabelText("닫기"));
  mockParams = null;
  await screen.rerender(<MediaViewerScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockCloseMediaViewer).toHaveBeenCalledTimes(1);
  await screen.unmount();
  expect(mockClearMediaViewer).toHaveBeenCalledTimes(1);
});

test("pages take the pager's own height, so it never scrolls vertically", async () => {
  const screen = await render(<MediaViewerScreen />);
  const pager = screen.getByTestId("media-viewer-pager");
  expect(pager.props.alwaysBounceVertical).toBe(false);
  await act(async () => {
    pager.props.onLayout({
      nativeEvent: { layout: { height: 500, width: 390 } },
    });
  });
  expect(screen.getByTestId("media-viewer-pager")).toBeTruthy();
});

test("shares the currently visible attachment", async () => {
  const screen = await render(<MediaViewerScreen />);
  fireEvent.press(screen.getByLabelText("공유"));
  expect(mockShareAttachment).toHaveBeenCalledWith({
    id: "photo-1",
    filename: "a.jpg",
    type: "image/jpeg",
  });
});

test("updates the n / N counter as the pager scrolls to a new page", async () => {
  const screen = await render(<MediaViewerScreen />);
  expect(screen.getByText("1 / 2")).toBeTruthy();
  const { width } = Dimensions.get("window");
  await act(async () => {
    screen.getByTestId("media-viewer-pager").props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { x: width, y: 0 } },
    });
  });
  expect(screen.getByText("2 / 2")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("공유"));
  expect(mockShareAttachment).toHaveBeenCalledWith({
    id: "video-1",
    filename: "b.mp4",
    type: "video/mp4",
  });
});

test("filters out a non-viewable (voice) attachment from the pager", async () => {
  const voice = { ...photo, id: "voice-1", type: "audio/mp4" };
  mockParams = {
    messageId: "message-1",
    attachments: [photo, voice],
    startIndex: 0,
  };
  const screen = await render(<MediaViewerScreen />);
  expect(screen.getByText("1 / 1")).toBeTruthy();
});

test("a ready video fills its page instead of collapsing in the centered page (device regression: black screen)", async () => {
  mockParams = { messageId: "message-1", attachments: [video], startIndex: 0 };
  mockUseMediaVideo.mockReturnValue({
    state: { status: "ready", uri: "file:///tmp/b.mp4" },
    available: true,
    open: jest.fn(),
    close: jest.fn(),
    playbackFailed: jest.fn(),
  });
  const screen = await render(<MediaViewerScreen />);
  const { width, height } = Dimensions.get("window");
  expect(screen.getByTestId("media-viewer-video-frame").props.style).toEqual({
    height,
    width,
  });
  // Its loading text sits on the black page.
  expect(screen.getByTestId("native-video-player").props.statusColor).toBe(
    "#FFFFFF",
  );
});

test("a video page opens once the viewer is focused, even though focus arrives after the first render (device regression: black page)", async () => {
  mockFocusCallbacks = [];
  mockScreenFocused = false;
  // Like `useMediaVideo`, opening before the screen is focused is a no-op.
  const opened = jest.fn();
  const open = jest.fn(async () => {
    if (mockScreenFocused) opened();
  });
  mockUseMediaVideo.mockReturnValue({
    state: { status: "idle" },
    available: true,
    open,
    close: jest.fn(),
    playbackFailed: jest.fn(),
  });
  mockParams = { messageId: "message-1", attachments: [video], startIndex: 0 };
  await render(<MediaViewerScreen />);
  expect(opened).not.toHaveBeenCalled();

  await act(async () => mockFocusScreen());
  expect(opened).toHaveBeenCalled();
});
