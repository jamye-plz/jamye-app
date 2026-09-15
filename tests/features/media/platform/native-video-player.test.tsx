import React from "react";
import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";
import { NativeVideoPlayer } from "@/features/media/platform/native-video-player";

const mockAvailable = jest.fn();
const mockOwned = jest.fn();
const mockHold = jest.fn();
const mockCreate = jest.fn();
jest.mock("expo", () => ({
  requireOptionalNativeModule: () => mockAvailable(),
}));
jest.mock("@/core/theme/theme-provider", () => ({
  useAppTheme: () => ({ colors: { text: "#29252D" } }),
  useAppThemeOrSystem: () => ({ colors: { text: "#29252D" } }),
}));
jest.mock("@/features/media/platform/media-downloads", () => ({
  isOwnedDownloadFile: (uri: string) => mockOwned(uri),
  retainDownloadedFile: (uri: string) => mockHold(uri),
}));
jest.mock("expo-video", () => ({
  createVideoPlayer: (...args: unknown[]) => mockCreate(...args),
  VideoView: (props: Record<string, unknown>) =>
    jest
      .requireActual<typeof import("react")>("react")
      .createElement(
        jest.requireActual<typeof import("react-native")>("react-native").View,
        { ...props, testID: "system-video-controls" },
      ),
}));

function player() {
  return {
    pause: jest.fn(),
    play: jest.fn(),
    release: jest.fn(),
    replaceAsync: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    loop: true,
    allowsExternalPlayback: true,
    staysActiveInBackground: true,
    showNowPlayingNotification: true,
    audioMixingMode: "auto",
  };
}
const uri = "file:///cache/media-downloads/1-video.mp4";
beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockReturnValue({});
  mockOwned.mockReturnValue(true);
  mockHold.mockReturnValue(jest.fn());
  mockCreate.mockReset().mockImplementation(player);
});
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

test("local playback uses native controls, disables background/PiP/casting, and releases native before file", async () => {
  const instance = player();
  mockCreate.mockReturnValue(instance);
  const releaseFile = jest.fn();
  mockHold.mockReturnValue(releaseFile);
  const screen = await render(
    <NativeVideoPlayer uri={uri} onError={jest.fn()} onClose={jest.fn()} />,
  );
  await flush();
  expect(mockCreate).toHaveBeenCalledWith(null);
  expect(instance.replaceAsync).toHaveBeenCalledWith({
    uri,
    useCaching: false,
  });
  expect(instance.play).toHaveBeenCalledTimes(1);
  expect(instance).toMatchObject({
    loop: false,
    staysActiveInBackground: false,
    allowsExternalPlayback: false,
    showNowPlayingNotification: false,
    audioMixingMode: "doNotMix",
  });
  expect(screen.getByTestId("system-video-controls").props).toMatchObject({
    nativeControls: true,
    contentFit: "contain",
    fullscreenOptions: { enable: false },
    allowsPictureInPicture: false,
    requiresLinearPlayback: false,
  });
  const status = instance.addListener.mock.calls[0] as unknown as [
    string,
    (payload: { status: string }) => void,
  ];
  await act(() => status[1]({ status: "readyToPlay" }));
  expect(screen.queryByText("동영상 준비 중…")).toBeNull();
  await unmountAndCheck();
  async function unmountAndCheck() {
    await screen.unmount();
    expect(instance.pause).toHaveBeenCalledTimes(1);
    expect(instance.release).toHaveBeenCalledTimes(1);
    expect(releaseFile).toHaveBeenCalledTimes(1);
    expect(instance.release.mock.invocationCallOrder[0]).toBeLessThan(
      releaseFile.mock.invocationCallOrder[0],
    );
  }
});

test.each([
  "https://media.example/signed?secret",
  "content://provider/video",
  "file:///user/video.mp4",
])("refuses any non-owned source: %s", async (source) => {
  mockOwned.mockReturnValue(false);
  const onError = jest.fn();
  await render(
    <NativeVideoPlayer uri={source} onError={onError} onClose={jest.fn()} />,
  );
  expect(onError).toHaveBeenCalledWith("playback");
  expect(mockCreate).not.toHaveBeenCalled();
});

test("an older installed binary reports missing native module without constructing a player", async () => {
  mockAvailable.mockReturnValue(null);
  const onError = jest.fn();
  await render(
    <NativeVideoPlayer uri={uri} onError={onError} onClose={jest.fn()} />,
  );
  expect(onError).toHaveBeenCalledWith("unavailable");
  expect(mockCreate).not.toHaveBeenCalled();
});

test.each([false, true])(
  "background closes once even if native pause fails: %s",
  async (pauseFails) => {
    const instance = player();
    mockCreate.mockReturnValue(instance);
    let onState!: (state: AppStateStatus) => void;
    const remove = jest.fn();
    const spy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        onState = listener;
        return { remove };
      });
    const onClose = jest.fn();
    const screen = await render(
      <NativeVideoPlayer uri={uri} onError={jest.fn()} onClose={onClose} />,
    );
    await flush();
    await act(() => onState("active"));
    expect(onClose).not.toHaveBeenCalled();
    if (pauseFails)
      instance.pause.mockImplementation(() => {
        throw new Error("released native player");
      });
    await act(() => onState("background"));
    expect(instance.pause).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(() => onState("background"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  },
);

test("background fences a pending prepare even before presentation unmounts", async () => {
  const instance = player();
  let finish!: () => void;
  instance.replaceAsync.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  mockCreate.mockReturnValue(instance);
  let onState!: (state: AppStateStatus) => void;
  const spy = jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, listener) => {
      onState = listener;
      return { remove: jest.fn() };
    });
  const onClose = jest.fn();
  const screen = await render(
    <NativeVideoPlayer uri={uri} onError={jest.fn()} onClose={onClose} />,
  );
  await act(() => onState("background"));
  await act(() => finish());
  await flush();
  expect(instance.play).not.toHaveBeenCalled();
  expect(screen.queryByTestId("system-video-controls")).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(1);
  await screen.unmount();
  spy.mockRestore();
});

test("native cleanup exceptions do not leak the file hold or interrupt closing", async () => {
  const instance = player();
  const releaseFile = jest.fn();
  const brokenCleanup = () => {
    throw new Error("native cleanup failed");
  };
  instance.pause.mockImplementation(brokenCleanup);
  instance.release.mockImplementation(brokenCleanup);
  instance.addListener.mockReturnValue({ remove: jest.fn(brokenCleanup) });
  mockHold.mockReturnValue(releaseFile);
  mockCreate.mockReturnValue(instance);
  const screen = await render(
    <NativeVideoPlayer uri={uri} onError={jest.fn()} onClose={jest.fn()} />,
  );
  await flush();
  await screen.unmount();
  expect(instance.release).toHaveBeenCalledTimes(1);
  expect(releaseFile).toHaveBeenCalledTimes(1);
});

test("closing while replaceAsync is pending cannot start late playback", async () => {
  const instance = player();
  let finish!: () => void;
  instance.replaceAsync.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  mockCreate.mockReturnValue(instance);
  const onError = jest.fn();
  const screen = await render(
    <NativeVideoPlayer uri={uri} onError={onError} onClose={jest.fn()} />,
  );
  await screen.unmount();
  await act(() => finish());
  await flush();
  expect(instance.play).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(instance.release).toHaveBeenCalledTimes(1);
});

test.each(["prepare", "decode", "construct"])(
  "%s failure uses safe error and releases the native file hold",
  async (phase) => {
    const instance = player();
    mockCreate.mockImplementation(() => {
      if (phase === "construct") throw new Error("private path");
      return instance;
    });
    if (phase === "prepare")
      instance.replaceAsync.mockRejectedValue(new Error("private path"));
    const onError = jest.fn();
    const screen = await render(
      <NativeVideoPlayer uri={uri} onError={onError} onClose={jest.fn()} />,
    );
    await flush();
    if (phase === "decode") {
      const status = instance.addListener.mock.calls[0] as unknown as [
        string,
        (payload: { status: string }) => void,
      ];
      await act(() => status[1]({ status: "error" }));
    }
    expect(onError).toHaveBeenCalledWith("playback");
    expect(JSON.stringify(screen.toJSON())).not.toContain("private path");
    await screen.unmount();
    expect(mockHold.mock.results[0].value).toHaveBeenCalledTimes(1);
  },
);
