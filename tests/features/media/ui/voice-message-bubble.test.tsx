import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

let mockFocused = true;
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) => {
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(
        () => (mockFocused ? callback() : undefined),
        [callback, mockFocused],
      );
  },
}));

const mockGetAccessUrl = jest.fn();
// A stable object identity matters here: `MediaImage`/`VoiceMessageBubble`'s
// download effect lists `access`/`runtime` in its dependency array, and the
// real hooks return memoized values. A fresh object literal per call would
// re-trigger the effect (and its `setLoaded`) every render -> infinite loop.
const mockMediaAccess = {
  getAccessUrl: (...args: unknown[]) => mockGetAccessUrl(...args),
  getDownloadLocation: jest.fn(),
  listChatroomMedia: jest.fn(),
};
jest.mock("@/features/media/model/use-media-access", () => ({
  useMediaAccess: () => mockMediaAccess,
}));

const mockMediaRuntime = {
  accountKey: "account-one",
  isCurrent: () => true,
  subscribeInvalidation: () => () => {},
};
jest.mock("@/features/media/model/media-runtime", () => ({
  useMediaRuntime: () => mockMediaRuntime,
  useMediaGeneration: () => 0,
}));

const mockAllocate = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/features/media/platform/media-downloads", () => ({
  allocateDownloadDestination: (...args: unknown[]) => mockAllocate(...args),
  removeDownloadedFile: (uri: string) => mockRemove(uri),
}));

const mockDownload = jest.fn();
jest.mock("@/features/media/platform/media-object-transfer", () => ({
  downloadToFile: (...args: unknown[]) => mockDownload(...args),
}));

const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockSeekTo = jest.fn();
let mockSession = {
  playing: false,
  currentTime: 0,
  duration: 0,
  isLoaded: false,
  play: mockPlay,
  pause: mockPause,
  seekTo: mockSeekTo,
};
const mockUseVoicePlaybackSession = jest.fn(
  (..._args: unknown[]) => mockSession,
);
jest.mock("@/features/media/platform/player", () => ({
  useVoicePlaybackSession: (...args: unknown[]) =>
    mockUseVoicePlaybackSession(...args),
}));

const mockRegisterActivePlayback = jest.fn((..._args: unknown[]) => jest.fn());
jest.mock("@/features/media/model/audio-playback-coordinator", () => ({
  registerActivePlayback: (...args: unknown[]) =>
    mockRegisterActivePlayback(...args),
}));

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { VoiceMessageBubble } from "@/features/media/ui/voice-message-bubble";
import type { ComponentProps } from "react";

function renderBubble(
  props: Partial<ComponentProps<typeof VoiceMessageBubble>> = {},
) {
  return render(
    <AppThemeProvider>
      <VoiceMessageBubble
        duration={12}
        filename="voice.m4a"
        mediaId="voice-1"
        mine
        {...props}
      />
    </AppThemeProvider>,
  );
}

beforeEach(() => {
  mockFocused = true;
  mockGetAccessUrl.mockReset().mockResolvedValue({
    url: "https://media.example/signed",
    byteSize: 10,
  });
  mockAllocate.mockReset().mockReturnValue({ uri: "file:///tmp/voice.m4a" });
  mockRemove.mockReset();
  mockDownload.mockReset().mockResolvedValue(undefined);
  mockPlay.mockReset();
  mockPause.mockReset();
  mockSeekTo.mockReset();
  mockRegisterActivePlayback.mockReset().mockReturnValue(jest.fn());
  mockSession = {
    playing: false,
    currentTime: 0,
    duration: 0,
    isLoaded: false,
    play: mockPlay,
    pause: mockPause,
    seekTo: mockSeekTo,
  };
  mockUseVoicePlaybackSession.mockReset().mockImplementation(() => mockSession);
});

async function flush() {
  await act(async () => {
    for (let step = 0; step < 8; step += 1) {
      await Promise.resolve();
    }
  });
}

test("downloads the attachment via MD4 access, then plays it on tap once ready", async () => {
  const screen = await renderBubble();
  await flush();
  expect(mockGetAccessUrl).toHaveBeenCalledWith("voice-1", expect.anything());
  expect(mockDownload).toHaveBeenCalled();
  mockSession = { ...mockSession, isLoaded: true };
  mockUseVoicePlaybackSession.mockImplementation(() => mockSession);
  await screen.rerender(
    <AppThemeProvider>
      <VoiceMessageBubble
        duration={12}
        filename="voice.m4a"
        mediaId="voice-1"
        mine
      />
    </AppThemeProvider>,
  );
  fireEvent.press(screen.getByLabelText("voice.m4a 재생"));
  expect(mockPlay).toHaveBeenCalledTimes(1);
});

test("shows the server duration before playback starts", async () => {
  const screen = await renderBubble({ duration: 72 });
  await flush();
  expect(screen.getByText("1:12")).toBeTruthy();
});

test("shows elapsed time while playing", async () => {
  mockSession = { ...mockSession, playing: true, currentTime: 5, duration: 12 };
  mockUseVoicePlaybackSession.mockImplementation(() => mockSession);
  const screen = await renderBubble();
  await flush();
  expect(screen.getByText("0:05")).toBeTruthy();
  expect(screen.getByLabelText("voice.m4a 일시정지")).toBeTruthy();
});

test("registers with the one-at-a-time coordinator once playback starts", async () => {
  mockSession = { ...mockSession, playing: true };
  mockUseVoicePlaybackSession.mockImplementation(() => mockSession);
  await renderBubble();
  await flush();
  expect(mockRegisterActivePlayback).toHaveBeenCalledWith(
    "voice-1",
    expect.any(Function),
  );
});

test("pauses when the screen blurs", async () => {
  const unregister = jest.fn();
  mockRegisterActivePlayback.mockReturnValue(unregister);
  const { unmount } = await renderBubble();
  await flush();
  await unmount();
  expect(mockPause).toHaveBeenCalled();
});

test("renders an inline share affordance that calls onShare (no full-screen viewer exists for audio)", async () => {
  const onShare = jest.fn();
  const screen = await renderBubble({ onShare });
  await flush();
  fireEvent.press(screen.getByLabelText("voice.m4a 공유"));
  expect(onShare).toHaveBeenCalledTimes(1);
});

test("long-pressing the bubble reports the message's context menu (chat-list-owned)", async () => {
  const onLongPress = jest.fn();
  mockSession = { ...mockSession, isLoaded: true };
  mockUseVoicePlaybackSession.mockImplementation(() => mockSession);
  const screen = await renderBubble({ onLongPress });
  await flush();
  fireEvent(screen.getByLabelText("voice.m4a 재생"), "longPress");
  expect(onLongPress).toHaveBeenCalledTimes(1);
});

test("every part of the bubble has a definite width that fits its max width (device regression: the track spilled out and the time wrapped per glyph)", async () => {
  const screen = await renderBubble({ onShare: jest.fn() });
  await flush();
  const flat = (node: { props: { style?: unknown } }) =>
    StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) ?? {};
  const column = screen.getByTestId("voice-track-column");
  const columnStyle = flat(column);
  // A `flex: 1` column inside a shrink-to-content bubble gets no width.
  expect(columnStyle.flex).toBeUndefined();
  expect(typeof columnStyle.width).toBe("number");
  const bubble = flat(column.parent!);
  const play = flat(screen.getByLabelText("voice.m4a 재생"));
  const share = flat(screen.getByLabelText("voice.m4a 공유"));
  const content =
    2 * Number(bubble.paddingHorizontal) +
    Number(play.minWidth) +
    Number(columnStyle.width) +
    Number(share.minWidth) +
    2 * Number(bubble.gap);
  expect(content).toBeLessThanOrEqual(Number(bubble.maxWidth));
});

// Kept last in the file: its retry flow (error -> press "다시 시도" -> a
// second, this time successful, download) settles its last `setState` late
// enough that it was observed to intermittently pollute the very next
// test's `act()` scope even after an explicit `unmount()` here. Ordering it
// last sidesteps that without weakening the assertions themselves; revisit
// if this test gains a sibling after it.
test("shows a retry action when the download fails, and allows exactly one retry", async () => {
  mockDownload.mockRejectedValue(new Error("network"));
  const screen = await renderBubble();
  await flush();
  expect(screen.getByText("음성을 불러오지 못했습니다.")).toBeTruthy();
  mockDownload.mockResolvedValue(undefined);
  fireEvent.press(screen.getByText("다시 시도"));
  await flush();
  expect(mockDownload).toHaveBeenCalledTimes(2);
  await flush();
  await screen.unmount();
});
