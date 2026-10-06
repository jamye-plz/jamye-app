import { act, fireEvent, render } from "@testing-library/react-native";
import { Dimensions, StyleSheet } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { MediaViewerScreen } from "@/features/media/ui/media-viewer-screen";

// Focus reaches the viewer after its first render, as on device: callbacks
// only run when a test calls `mockFocusScreen()`.
let mockFocusCallbacks: (() => void)[] = [];
let mockScreenFocused = false;
function mockFocusScreen() {
  mockScreenFocused = true;
  for (const callback of mockFocusCallbacks) callback();
}
// E4/C4: the route's own sessionId param, read via useLocalSearchParams.
// undefined (the default) means "no session param in this render" -- the
// same as every pre-E4 test in this file, none of which care about it.
let mockRouteSessionId: string | undefined;
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocusCallbacks.push(callback);
  },
  useLocalSearchParams: () => ({ sessionId: mockRouteSessionId }),
}));

// F-1: configurable per test so the regression test below can simulate a
// device that reports a non-zero top inset (status bar / Dynamic Island)
// without depending on react-native-safe-area-context's own native module,
// which jsdom/jest has no bridge for.
let mockSafeAreaInsets: {
  top: number;
  bottom: number;
  left: number;
  right: number;
} = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView:
    jest.requireActual<typeof import("react-native")>("react-native").View,
  useSafeAreaInsets: () => mockSafeAreaInsets,
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

// F2/MEDIA-AC8: gesture mock pattern from `media-image-viewer.test.tsx:34-62`.
// This screen builds exactly one pinch, one dismiss pan, and one double-tap
// gesture at a time, so registering captured handlers by a fixed name (not
// per-instance) is safe -- each fresh `render()` re-creates and overwrites
// them.
type GestureEvent = {
  scale?: number;
  translationX: number;
  translationY: number;
  velocityY?: number;
};
type TouchPoint = { x: number; y: number };
type TouchEvent = { changedTouches: TouchPoint[] };
type StateManager = { fail: () => void };
type Handlers = {
  start?: () => void;
  update?: (event: GestureEvent) => void;
  end?: (event: GestureEvent, success?: boolean) => void;
  touchesDown?: (event: TouchEvent, stateManager: StateManager) => void;
};
const mockGestures: Record<string, Handlers> = {};
jest.mock("react-native-gesture-handler", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const gesture = (name: string) => {
    const handlers: Handlers = {};
    mockGestures[name] = handlers;
    const chain = {
      runOnJS: () => chain,
      activeOffsetY: () => chain,
      failOffsetX: () => chain,
      numberOfTaps: () => chain,
      onTouchesDown: (callback: Handlers["touchesDown"]) => {
        handlers.touchesDown = callback;
        return chain;
      },
      onStart: (callback: () => void) => {
        handlers.start = callback;
        return chain;
      },
      onUpdate: (callback: (event: GestureEvent) => void) => {
        handlers.update = callback;
        return chain;
      },
      onEnd: (callback: (event: GestureEvent, success?: boolean) => void) => {
        handlers.end = callback;
        return chain;
      },
    };
    return chain;
  };
  return {
    GestureDetector: View,
    Gesture: {
      Pinch: () => gesture("pinch"),
      Pan: () => gesture("pan"),
      Tap: () => gesture("tap"),
      Simultaneous: (..._gestures: unknown[]) => ({}),
    },
  };
});

// F2: shared-value mock pattern from `media-image-viewer.test.tsx:66-96` --
// a stable per-hook-call box exposing the real `.get()`/`.set()` API.
jest.mock("react-native-reanimated", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    useSharedValue: (initial: unknown) => {
      const ref = ReactActual.useRef<{
        get: () => unknown;
        set: (next: unknown) => void;
      } | null>(null);
      if (!ref.current) {
        let value = initial;
        ref.current = {
          get: () => value,
          set: (next: unknown) => {
            value = next;
          },
        };
      }
      return ref.current;
    },
  };
});

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
  mockRouteSessionId = undefined;
  mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
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

test("closes itself when the route's sessionId does not match the store's current session (E4 stale-session defense)", async () => {
  mockParams = {
    messageId: "message-1",
    attachments: [photo, video],
    startIndex: 0,
    sessionId: "session-current",
  };
  mockRouteSessionId = "session-stale";
  await render(<MediaViewerScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockCloseMediaViewer).toHaveBeenCalledTimes(1);
});

test("renders normally when the route's sessionId matches the store's current session", async () => {
  mockParams = {
    messageId: "message-1",
    attachments: [photo, video],
    startIndex: 0,
    sessionId: "session-current",
  };
  mockRouteSessionId = "session-current";
  const screen = await render(<MediaViewerScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockCloseMediaViewer).not.toHaveBeenCalled();
  expect(screen.getByText("1 / 2")).toBeTruthy();
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

test("pinch onStart snapshots the current scale, so a second pinch multiplies from where the first left off (MEDIA-AC8)", async () => {
  const screen = await render(<MediaViewerScreen />);
  const getScale = () =>
    screen.getByRole("image", { name: "a.jpg 상세 이미지" }).props.style
      .transform[2].scale;
  expect(getScale()).toBe(1);
  await act(() => {
    mockGestures.pinch.start?.();
    mockGestures.pinch.update?.({
      scale: 2,
      translationX: 0,
      translationY: 0,
    });
  });
  expect(getScale()).toBe(2);
  await act(() => {
    // A second, independent pinch gesture: `.onStart` must re-snapshot the
    // *current* scale (2), not reuse the first gesture's start value.
    mockGestures.pinch.start?.();
    mockGestures.pinch.update?.({
      scale: 1.5,
      translationX: 0,
      translationY: 0,
    });
  });
  expect(getScale()).toBe(3);
});

test("pinch onUpdate clamps to the model's zoom ceiling (MEDIA-AC8)", async () => {
  const screen = await render(<MediaViewerScreen />);
  await act(() => {
    mockGestures.pinch.start?.();
    mockGestures.pinch.update?.({
      scale: 10,
      translationX: 0,
      translationY: 0,
    });
  });
  expect(
    screen.getByRole("image", { name: "a.jpg 상세 이미지" }).props.style
      .transform[2].scale,
  ).toBe(4);
});

test("dismiss pan onEnd closes past the distance threshold, and only resets the drag otherwise (MEDIA-AC8)", async () => {
  await render(<MediaViewerScreen />);
  await act(() => {
    mockGestures.pan.end?.({ translationX: 0, translationY: 50, velocityY: 0 });
  });
  expect(mockCloseMediaViewer).not.toHaveBeenCalled();
  await act(() => {
    mockGestures.pan.end?.({
      translationX: 0,
      translationY: 200,
      velocityY: 0,
    });
  });
  expect(mockCloseMediaViewer).toHaveBeenCalledTimes(1);
});

test("the video-control exclusion does not apply on a photo page (E4/C4)", async () => {
  await render(<MediaViewerScreen />);
  const { width, height } = Dimensions.get("window");
  const fail = jest.fn();
  mockGestures.pan.touchesDown?.(
    { changedTouches: [{ x: width / 2, y: height - 10 }] },
    { fail },
  );
  expect(fail).not.toHaveBeenCalled();
});

test("the dismiss pan does not start inside the video's control areas (E4/C4)", async () => {
  mockParams = {
    messageId: "message-1",
    attachments: [photo, video],
    startIndex: 1,
  };
  await render(<MediaViewerScreen />);
  const { width, height } = Dimensions.get("window");
  // Bottom playback-control band.
  const bottomFail = jest.fn();
  mockGestures.pan.touchesDown?.(
    { changedTouches: [{ x: width / 2, y: height - 10 }] },
    { fail: bottomFail },
  );
  expect(bottomFail).toHaveBeenCalledTimes(1);
  // Top share/close band.
  const topFail = jest.fn();
  mockGestures.pan.touchesDown?.(
    { changedTouches: [{ x: width / 2, y: 10 }] },
    { fail: topFail },
  );
  expect(topFail).toHaveBeenCalledTimes(1);
  // Center play/pause hit zone.
  const centerFail = jest.fn();
  mockGestures.pan.touchesDown?.(
    { changedTouches: [{ x: width / 2, y: height / 2 }] },
    { fail: centerFail },
  );
  expect(centerFail).toHaveBeenCalledTimes(1);
});

test("the dismiss pan still starts and closes elsewhere on a video page (E4/C4)", async () => {
  mockParams = {
    messageId: "message-1",
    attachments: [photo, video],
    startIndex: 1,
  };
  await render(<MediaViewerScreen />);
  const { height } = Dimensions.get("window");
  const fail = jest.fn();
  // Clear of every control band/zone for any realistic test window height:
  // more than the center zone's half-width (48) below the vertical middle,
  // and far from the horizontal middle too.
  mockGestures.pan.touchesDown?.(
    { changedTouches: [{ x: 4, y: height / 2 + 49 }] },
    { fail },
  );
  expect(fail).not.toHaveBeenCalled();
  await act(() => {
    mockGestures.pan.end?.({
      translationX: 0,
      translationY: 200,
      velocityY: 0,
    });
  });
  expect(mockCloseMediaViewer).toHaveBeenCalledTimes(1);
});

// F-1 (iOS device regression): inside the route's `fullScreenModal`
// presentation, `react-native-screens` presents the screen as a separate,
// modally-presented view controller. `SafeAreaView`'s native component
// measures insets by walking its own native superview chain for the nearest
// `SafeAreaProvider` and falls back to measuring itself when none is found
// across that boundary -- on device this settles at a top inset of 0, so the
// 닫기/공유 row renders under the status bar / Dynamic Island and swallows the
// first tap (Maestro-measured `닫기` bounds `[16,0][60,44]`). `useSafeAreaInsets()`
// instead reads the same insets through plain React context, which is not
// severed by that native boundary. The regression contract below locates the
// drag-to-dismiss container by its surviving `translateY` transform (kept
// unchanged by the fix) and asserts it carries the reported top inset as
// explicit padding.
function findDragContainerStyle(node: unknown): ViewStyle | null {
  if (node == null) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findDragContainerStyle(child);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const { props, children } = node as {
    props: { style?: StyleProp<ViewStyle> };
    children: unknown;
  };
  // `StyleSheet.flatten` is typed as returning a bare `ViewStyle`, but at
  // runtime it returns `undefined` for a node with no `style` prop at all
  // (most nodes in this tree -- ScrollView's text children, StatusBar,
  // etc. -- have none), so that must be checked before reading `.transform`.
  const flattened: ViewStyle | undefined = StyleSheet.flatten(props.style);
  if (
    flattened &&
    Array.isArray(flattened.transform) &&
    flattened.transform.some(
      (entry) =>
        typeof entry === "object" && entry !== null && "translateY" in entry,
    )
  ) {
    return flattened;
  }
  return findDragContainerStyle(children);
}

test("pushes the header below the top safe-area inset inside the iOS fullScreenModal (F-1 device regression: 닫기/공유 hidden under the status bar)", async () => {
  mockSafeAreaInsets = { top: 59, bottom: 34, left: 0, right: 0 };
  const screen = await render(<MediaViewerScreen />);
  const dragContainerStyle = findDragContainerStyle(screen.toJSON());
  expect(dragContainerStyle).not.toBeNull();
  expect(dragContainerStyle?.paddingTop ?? 0).toBeGreaterThanOrEqual(59);
});
