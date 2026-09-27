import { act, fireEvent, render } from "@testing-library/react-native";

import type { ChatroomMediaItem } from "@/core/contracts/server/media";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { ChatroomMediaThumbnail } from "@/features/media/ui/chatroom-media-thumbnail";

type VideoHookState =
  | { status: "idle" }
  | { status: "downloading" }
  | { status: "ready"; uri: string }
  | { status: "error"; message: string };

type VideoHookResult = {
  state: VideoHookState;
  available: boolean;
  open: jest.Mock;
  close: jest.Mock;
  playbackFailed: jest.Mock;
};

type ThumbnailHookState =
  | null
  | { status: "loading" }
  | { status: "ready"; uri: string }
  | { status: "error" };

type ThumbnailHookResult = {
  state: ThumbnailHookState;
  retry: jest.Mock;
  canRetry: boolean;
  imageFailed: jest.Mock;
};

const mockUseMediaVideo = jest.fn();
const mockUseMediaVideoThumbnail = jest.fn();

// The video state machine and its poster-thumbnail sibling are exercised end
// to end (through a real MediaRuntimeProvider) by media-video-card.test.tsx
// and media-video-thumbnail.test.tsx. This file mocks both hooks directly so
// it can drive ChatroomVideoThumbnail through every rendering branch
// (idle/downloading/ready/error, poster loading/ready/failed) without
// re-deriving that machinery.
jest.mock("@/features/media/ui/use-media-video", () => ({
  useMediaVideo: (...args: unknown[]) => mockUseMediaVideo(...args),
}));
jest.mock("@/features/media/ui/use-media-video-thumbnail", () => ({
  useMediaVideoThumbnail: (...args: unknown[]) =>
    mockUseMediaVideoThumbnail(...args),
}));

// The real SafeAreaProvider never commits its children synchronously in this
// test environment (it waits for a native onLayout to resolve insets first),
// which would otherwise hide everything MediaViewerModal renders. Mirrors
// media-video-card.test.tsx's own mock.
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider:
    jest.requireActual<typeof import("react-native")>("react-native").View,
  SafeAreaView:
    jest.requireActual<typeof import("react-native")>("react-native").View,
}));

// expo-image's <Image> renders `accessible={false}` here with no testID/label
// of its own, so it cannot be found via role/text/label queries; give the
// mock a fixed testID purely for test lookup.
jest.mock("expo-image", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { Image: RNImage } = require("react-native");
  return {
    Image: ({
      onError,
      source,
    }: {
      onError?: (event: unknown) => void;
      source: { uri: string };
    }) => <RNImage onError={onError} source={source} testID="poster-image" />,
  };
});

// The non-video branch delegates straight to MediaImage; that component has
// its own coverage, so it is replaced with a thin prop recorder here to keep
// this file scoped to ChatroomMediaThumbnail's own delegation/branch logic.
jest.mock("@/features/media/ui/media-image", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { View } = require("react-native");
  return {
    MediaImage: ({
      fill,
      filename,
      label,
      mediaId,
      size,
    }: {
      fill?: boolean;
      filename: string | null;
      label: string;
      mediaId: string;
      size: number;
    }) => (
      <View
        testID="media-image"
        {...{ fill, filename, label, mediaId, size }}
      />
    ),
  };
});

// Mirrors media-video-card.test.tsx's own NativeVideoPlayer stub: the real
// player pulls in native expo-video internals that add nothing to this
// file's own branch coverage.
jest.mock("@/features/media/platform/native-video-player", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { View } = require("react-native");
  return {
    NativeVideoPlayer: ({
      onClose,
      onError,
      uri,
    }: {
      onClose: () => void;
      onError: (reason: "unavailable" | "playback") => void;
      uri: string;
    }) => <View testID="native-player" {...{ onClose, onError, uri }} />,
  };
});

function item(overrides: Partial<ChatroomMediaItem> = {}): ChatroomMediaItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    mediaUploadId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/jpeg",
    byteSize: 1,
    width: 10,
    height: 10,
    duration: null,
    filename: "photo.jpg",
    position: 0,
    posterMediaId: null,
    messageId: "message-1",
    messageCreatedAt: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function setVideoHook(
  overrides: Partial<VideoHookResult> = {},
): VideoHookResult {
  const result: VideoHookResult = {
    state: { status: "idle" },
    available: true,
    open: jest.fn(),
    close: jest.fn(),
    playbackFailed: jest.fn(),
    ...overrides,
  };
  mockUseMediaVideo.mockReturnValue(result);
  return result;
}

function setThumbnailHook(
  overrides: Partial<ThumbnailHookResult> = {},
): ThumbnailHookResult {
  const result: ThumbnailHookResult = {
    state: null,
    retry: jest.fn(),
    canRetry: false,
    imageFailed: jest.fn(),
    ...overrides,
  };
  mockUseMediaVideoThumbnail.mockReturnValue(result);
  return result;
}

async function renderThumbnail(
  props: Readonly<{
    fill?: boolean;
    item?: ChatroomMediaItem;
    size?: number;
  }> = {},
) {
  const { fill, item: mediaItem = item(), size = 92 } = props;
  return render(
    <AppThemeProvider>
      <ChatroomMediaThumbnail fill={fill} item={mediaItem} size={size} />
    </AppThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ChatroomMediaThumbnail", () => {
  test("a non-video item delegates to MediaImage with the 사진 label and forwards fill/size", async () => {
    const screen = await renderThumbnail({
      fill: true,
      item: item({ contentType: "image/jpeg", filename: "photo.jpg" }),
      size: 80,
    });
    const image = screen.getByTestId("media-image");
    expect(image.props.fill).toBe(true);
    expect(image.props.filename).toBe("photo.jpg");
    expect(image.props.label).toBe("사진");
    expect(image.props.mediaId).toBe("11111111-1111-4111-8111-111111111111");
    expect(image.props.size).toBe(80);
    expect(mockUseMediaVideo).not.toHaveBeenCalled();
  });
});

describe("ChatroomVideoThumbnail", () => {
  test("idle: an unavailable video is disabled and labeled with its duration", async () => {
    setVideoHook({ available: false });
    setThumbnailHook();
    const screen = await renderThumbnail({
      item: item({ contentType: "video/mp4", duration: 75 }),
    });
    expect(screen.getByRole("button", { name: "동영상 1:15" })).toBeDisabled();
    expect(screen.queryByTestId("native-player")).toBeNull();
  });

  test("idle: pressing an available thumbnail calls open()", async () => {
    const { open } = setVideoHook();
    setThumbnailHook();
    const screen = await renderThumbnail({
      item: item({ contentType: "video/mp4" }),
    });
    await fireEvent.press(screen.getByRole("button", { name: "동영상" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  test("downloading: shows a live status message inside the viewer modal", async () => {
    setVideoHook({ state: { status: "downloading" } });
    setThumbnailHook();
    const screen = await renderThumbnail({
      item: item({ contentType: "video/mp4" }),
    });
    expect(screen.getByText("동영상 받는 중…")).toBeTruthy();
  });

  test("ready: renders the native player with the resolved uri and wires close/error", async () => {
    const { close, playbackFailed } = setVideoHook({
      state: { status: "ready", uri: "file:///owned/1-video.mp4" },
    });
    setThumbnailHook();
    const screen = await renderThumbnail({
      item: item({ contentType: "video/mp4" }),
    });
    const player = screen.getByTestId("native-player");
    expect(player.props.uri).toBe("file:///owned/1-video.mp4");
    await act(() => player.props.onClose());
    expect(close).toHaveBeenCalledTimes(1);
    await act(() => player.props.onError("playback"));
    expect(playbackFailed).toHaveBeenCalledWith("playback");
  });

  test("error: shows the failure message and retrying calls open() again", async () => {
    const { open } = setVideoHook({
      state: {
        status: "error",
        message: "동영상을 불러오지 못했습니다. 다시 시도해 주세요.",
      },
    });
    setThumbnailHook();
    const screen = await renderThumbnail({
      item: item({ contentType: "video/mp4" }),
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/불러오지 못했습니다/);
    await fireEvent.press(
      screen.getByRole("button", { name: "동영상 다시 시도" }),
    );
    expect(open).toHaveBeenCalledTimes(1);
  });

  test("a ready poster thumbnail renders the cached image; its load failure calls imageFailed", async () => {
    setVideoHook();
    const { imageFailed } = setThumbnailHook({
      state: { status: "ready", uri: "file:///owned/poster.jpg" },
    });
    const screen = await renderThumbnail({
      item: item({ contentType: "video/mp4" }),
    });
    const poster = screen.getByTestId("poster-image");
    expect(poster.props.source).toEqual({ uri: "file:///owned/poster.jpg" });
    await fireEvent(poster, "error", { nativeEvent: { error: "decode" } });
    expect(imageFailed).toHaveBeenCalledTimes(1);
  });

  test("a loading poster thumbnail does not render the cached image yet", async () => {
    setVideoHook();
    setThumbnailHook({ state: { status: "loading" } });
    const screen = await renderThumbnail({
      item: item({ contentType: "video/mp4" }),
    });
    expect(screen.queryByTestId("poster-image")).toBeNull();
  });

  test("fill sizes the pressable box to 100% instead of the size square", async () => {
    setVideoHook();
    setThumbnailHook();
    const screen = await renderThumbnail({
      fill: true,
      item: item({ contentType: "video/mp4" }),
      size: 92,
    });
    const button = screen.getByRole("button", { name: "동영상" });
    expect(button.props.style).toEqual({ height: "100%", width: "100%" });
  });
});
