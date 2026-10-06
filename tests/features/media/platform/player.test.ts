import { act, renderHook } from "@testing-library/react-native";
import * as ExpoAudio from "expo-audio";
import { setAudioModeAsync } from "expo-audio";

import {
  useVoicePlaybackSession,
  useVoicePreviewPlayer,
} from "@/features/media/platform/player";

// `__set*`/`__resetExpoAudioMock` are test-only helpers the manual mock adds
// on top of `expo-audio`'s real public surface (see
// `tests/__mocks__/expo-audio.ts`'s docstring) -- `tsc` checks this file's
// imports against the *real* package's `.d.ts` (jest's manual-mock
// resolution is a runtime-only concern), so referencing them as if they
// were part of "expo-audio" itself does not type-check. Importing the
// module normally (guaranteeing the exact same instance
// `player.ios.ts`/`player.android.ts` resolve via their own `expo-audio`
// import) and casting locally to the mock's real shape avoids both that and
// `jest.requireMock`'s separate, unconnected instance.
const audioMock =
  ExpoAudio as unknown as typeof import("../../../__mocks__/expo-audio");

beforeEach(() => {
  audioMock.__resetExpoAudioMock();
  (setAudioModeAsync as jest.Mock).mockClear();
});

test("requests silent-mode playback once per process on first mount", async () => {
  await renderHook(() => useVoicePlaybackSession(null));
  await act(async () => {
    await Promise.resolve();
  });
  expect(setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true });
});

test("replaces the underlying player's source once a downloaded uri becomes available", async () => {
  const mockReplace = jest.fn();
  audioMock.__setPlayer({ replace: mockReplace });
  const { rerender } = await renderHook(
    ({ uri }: { uri: string | null }) => useVoicePlaybackSession(uri),
    { initialProps: { uri: null } },
  );
  expect(mockReplace).not.toHaveBeenCalled();
  await rerender({ uri: "file:///tmp/voice.m4a" });
  expect(mockReplace).toHaveBeenCalledWith({ uri: "file:///tmp/voice.m4a" });
  // A second render with the same uri must not replace again.
  await rerender({ uri: "file:///tmp/voice.m4a" });
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

test("play/pause/seekTo delegate to the underlying player", async () => {
  const mockPlay = jest.fn();
  const mockPause = jest.fn();
  const mockSeekTo = jest.fn(async () => undefined);
  audioMock.__setPlayer({
    play: mockPlay,
    pause: mockPause,
    seekTo: mockSeekTo,
  });
  const { result } = await renderHook(() => useVoicePlaybackSession(null));
  result.current.play();
  result.current.pause();
  await result.current.seekTo(5);
  expect(mockPlay).toHaveBeenCalledTimes(1);
  expect(mockPause).toHaveBeenCalledTimes(1);
  expect(mockSeekTo).toHaveBeenCalledWith(5);
});

test("surfaces the player status's playing/currentTime/duration/isLoaded", async () => {
  audioMock.__setPlayerStatus({
    id: "mock-audio-player",
    currentTime: 3,
    duration: 12,
    playing: true,
    isLoaded: true,
    isBuffering: false,
    didJustFinish: false,
    loop: false,
    mute: false,
    error: null,
  });
  const { result } = await renderHook(() => useVoicePlaybackSession(null));
  expect(result.current).toMatchObject({
    playing: true,
    currentTime: 3,
    duration: 12,
    isLoaded: true,
  });
});

test.each([
  ["ios", "@/features/media/platform/player.ios"],
  ["android", "@/features/media/platform/player.android"],
])(
  "%s: calls on a player its unmount cleanup already released are ignored (device regression: red screen leaving a chat)",
  async (_platform, modulePath) => {
    const released = () => {
      throw new Error("Cannot use shared object that was already released");
    };
    audioMock.__setPlayer({
      pause: jest.fn(released),
      play: jest.fn(released),
      seekTo: jest.fn(async () => released()),
    });
    const { useVoicePlaybackSession: usePlatformSession } =
      jest.requireActual<typeof import("@/features/media/platform/player.ios")>(
        modulePath,
      );
    const { result } = await renderHook(() => usePlatformSession(null));
    expect(() => result.current.pause()).not.toThrow();
    expect(() => result.current.play()).not.toThrow();
    await expect(result.current.seekTo(5)).resolves.toBeUndefined();
  },
);

// F-11: expo-audio leaves a finished clip parked at its end on both
// platforms, so a bare play() ends again at once -- reproduced with a real
// voice message on the iOS simulator and the Android emulator.
function recordCalls(): string[] {
  const calls: string[] = [];
  audioMock.__setPlayer({
    play: jest.fn(() => {
      calls.push("play");
    }),
    seekTo: jest.fn(async (seconds: number) => {
      calls.push(`seek:${seconds}`);
    }),
  });
  return calls;
}

test("play() on a clip parked at its end rewinds to the start before playing", async () => {
  const calls = recordCalls();
  audioMock.__setPlayerStatus({ currentTime: 7.78, duration: 7.78 });
  const { result } = await renderHook(() => useVoicePlaybackSession(null));
  await act(async () => {
    result.current.play();
  });
  expect(calls).toEqual(["seek:0", "play"]);
});

test("play() mid-clip resumes in place without rewinding", async () => {
  const calls = recordCalls();
  audioMock.__setPlayerStatus({ currentTime: 3, duration: 12 });
  const { result } = await renderHook(() => useVoicePlaybackSession(null));
  await act(async () => {
    result.current.play();
  });
  expect(calls).toEqual(["play"]);
});

test("the composer preview replays a finished take from the start", async () => {
  const calls = recordCalls();
  audioMock.__setPlayerStatus({ currentTime: 4.2, duration: 4.2 });
  const { result } = await renderHook(() =>
    useVoicePreviewPlayer("file:///tmp/take.m4a"),
  );
  await act(async () => {
    result.current.toggle();
  });
  expect(calls).toEqual(["seek:0", "play"]);
});
