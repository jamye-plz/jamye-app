import React from "react";
import type { PropsWithChildren } from "react";
import {
  act,
  fireEvent,
  render,
  renderHook,
} from "@testing-library/react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import {
  createMediaLifetime,
  MediaRuntimeProvider,
} from "@/features/media/model/media-runtime";
import type { MediaRuntime } from "@/features/media/model/media-runtime";
import { MediaVideoCard } from "@/features/media/ui/media-video-card";
import { useMediaVideo } from "@/features/media/ui/use-media-video";
import { MAX_VIDEO_BYTES } from "@/features/media/model/media-policy";
import { invalidateMediaObjectCache } from "@/features/media/platform/media-object-cache";

const mockDownload = jest.fn();
const mockRemove = jest.fn();
const mockAllocate = jest.fn();
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
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider:
    jest.requireActual<typeof import("react-native")>("react-native").View,
  SafeAreaView:
    jest.requireActual<typeof import("react-native")>("react-native").View,
}));
jest.mock("@/features/media/platform/native-video-thumbnail", () => ({
  createNativeVideoThumbnail: jest.fn(),
}));
jest.mock("@/features/media/platform/media-object-transfer", () => ({
  downloadToFile: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock("@/features/media/platform/media-downloads", () => ({
  allocateDownloadDestination: (...args: unknown[]) => mockAllocate(...args),
  removeDownloadedFile: (uri: string) => mockRemove(uri),
  retainDownloadedFile: (uri: string) => () => mockRemove(uri),
}));
jest.mock("@/features/media/platform/native-video-player", () => ({
  NativeVideoPlayer: (props: Record<string, unknown>) =>
    jest
      .requireActual<typeof import("react")>("react")
      .createElement(
        jest.requireActual<typeof import("react-native")>("react-native").View,
        { ...props, testID: "native-player" },
      ),
}));

const id = "11111111-1111-4111-8111-111111111111";
const signed = "https://media.example/video?private-signature";
const metadata = { id, contentType: "video/mp4", byteSize: 10, url: signed };
function setup() {
  const lifetime = createMediaLifetime(true);
  const getAccess = jest.fn().mockResolvedValue(metadata);
  const runtime: MediaRuntime = {
    ...lifetime,
    accountKey: "account-one",
    api: {
      getAccess,
      getDownloadLocation: jest.fn(),
      createUpload: jest.fn(),
      finalizeUpload: jest.fn(),
      listTopicMedia: jest.fn(),
    },
    authorize: (execute, signal) =>
      execute("bearer-only-for-api", signal ?? new AbortController().signal),
    objectPut: { put: jest.fn() },
    cleanup: { deleteIfExists: jest.fn() },
  };
  const Wrapper = ({ children }: PropsWithChildren) => (
    <AppThemeProvider>
      <MediaRuntimeProvider value={runtime}>{children}</MediaRuntimeProvider>
    </AppThemeProvider>
  );
  return { runtime, lifetime, getAccess, Wrapper };
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 15; i++) await Promise.resolve();
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  invalidateMediaObjectCache();
  mockFocused = true;
  mockDownload.mockReset().mockResolvedValue({ byteSize: 10 });
  let sequence = 0;
  mockAllocate.mockReset().mockImplementation(() => ({
    uri: `file:///owned/${++sequence}-video.mp4`,
  }));
});

test("a named video card downloads only on play and passes only the local file to the player", async () => {
  const { Wrapper, getAccess } = setup();
  const screen = await render(
    <Wrapper>
      <MediaVideoCard mediaId={id} filename="clip.mov" />
    </Wrapper>,
  );
  expect(getAccess).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "clip.mov 재생" }));
  await flush();
  expect(getAccess).toHaveBeenCalledWith(
    "bearer-only-for-api",
    id,
    expect.any(AbortSignal),
  );
  expect(mockAllocate).toHaveBeenCalledWith({
    mediaId: id,
    filename: "video.mp4",
  });
  expect(mockDownload).toHaveBeenCalledWith({
    url: signed,
    destination: { uri: "file:///owned/1-video.mp4" },
    maxBytes: MAX_VIDEO_BYTES,
    expectedBytes: 10,
    signal: expect.any(AbortSignal),
  });
  expect(screen.getByTestId("native-player").props.uri).toBe(
    "file:///owned/1-video.mp4",
  );
  expect(screen.queryByText(/private-signature/)).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "동영상 닫기" }));
  expect(screen.queryByTestId("native-player")).toBeNull();
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/1-video.mp4");
});

test.each([
  { contentType: "image/jpeg" },
  { byteSize: MAX_VIDEO_BYTES + 1 },
  { byteSize: 0 },
  { byteSize: 1.5 },
  { id: "different-id" },
])(
  "invalid video metadata fails before file/network playback: %j",
  async (change) => {
    const { Wrapper, getAccess } = setup();
    getAccess.mockResolvedValue({ ...metadata, ...change });
    const { result } = await renderHook(() => useMediaVideo(id), {
      wrapper: Wrapper,
    });
    await act(() => result.current.open());
    expect(result.current.state.status).toBe("error");
    expect(mockAllocate).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
  },
);

test("download failure is safe and retry obtains a new access URL", async () => {
  const { Wrapper, getAccess } = setup();
  mockDownload.mockRejectedValueOnce(new Error(signed));
  const screen = await render(
    <Wrapper>
      <MediaVideoCard mediaId={id} filename={null} />
    </Wrapper>,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "첨부 동영상 재생" }),
  );
  await flush();
  expect(screen.getByRole("alert")).toHaveTextContent(
    /동영상을 불러오지 못했습니다/,
  );
  expect(screen.queryByText(/private-signature/)).toBeNull();
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/1-video.mp4");
  await fireEvent.press(
    screen.getByRole("button", { name: "동영상 다시 시도" }),
  );
  await flush();
  expect(getAccess).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("native-player").props.uri).toBe(
    "file:///owned/2-video.mp4",
  );
});

test.each(["background", "account-disposal"])(
  "%s cancels pending work and ignores a late result",
  async (reason) => {
    const { Wrapper, lifetime } = setup();
    let finish!: () => void;
    mockDownload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = await renderHook(() => useMediaVideo(id), {
      wrapper: Wrapper,
    });
    let pending!: Promise<void>;
    await act(() => {
      pending = result.current.open();
    });
    await flush();
    await act(() =>
      reason === "background"
        ? lifetime.setForeground(false)
        : lifetime.dispose(),
    );
    expect(mockDownload.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.state.status).toBe("idle");
    expect(mockRemove).toHaveBeenCalledWith("file:///owned/1-video.mp4");
  },
);

test("cancel and immediately replay never lets the old operation erase the new one", async () => {
  const { Wrapper } = setup();
  let finish!: () => void;
  mockDownload.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = await renderHook(() => useMediaVideo(id), {
    wrapper: Wrapper,
  });
  let old!: Promise<void>;
  await act(() => {
    old = result.current.open();
  });
  await flush();
  await act(() => result.current.close());
  await act(() => result.current.open());
  await act(async () => {
    finish();
    await old;
  });
  expect(result.current.state).toEqual({
    status: "ready",
    uri: "file:///owned/2-video.mp4",
  });
  expect(mockRemove).not.toHaveBeenCalledWith("file:///owned/2-video.mp4");
});

test("blur stops playback, releases the file, and requires explicit play after refocus", async () => {
  const { Wrapper } = setup();
  const { result, rerender, unmount } = await renderHook(
    () => useMediaVideo(id),
    { wrapper: Wrapper },
  );
  await act(() => result.current.open());
  mockFocused = false;
  await rerender({});
  expect(result.current.state.status).toBe("idle");
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/1-video.mp4");
  await act(() => result.current.open());
  expect(mockDownload).toHaveBeenCalledTimes(1);
  mockFocused = true;
  await rerender({});
  await act(() => result.current.open());
  await unmount();
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/2-video.mp4");
});

test("a recycled attachment closes its old video and ignores the old player's callback", async () => {
  const { Wrapper, getAccess } = setup();
  const { result, rerender } = await renderHook(
    ({ mediaId }: { mediaId: string }) => useMediaVideo(mediaId),
    { wrapper: Wrapper, initialProps: { mediaId: id } },
  );
  await act(() => result.current.open());
  const oldFailure = result.current.playbackFailed;
  const nextId = "22222222-2222-4222-8222-222222222222";
  await rerender({ mediaId: nextId });
  expect(result.current.state.status).toBe("idle");
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/1-video.mp4");
  await act(() => oldFailure("playback"));
  expect(result.current.state.status).toBe("idle");
  getAccess.mockResolvedValue({ ...metadata, id: nextId });
  await act(() => result.current.open());
  expect(result.current.state).toEqual({
    status: "ready",
    uri: "file:///owned/2-video.mp4",
  });
});

test("closing during authorization never allocates a file or downloads a late URL", async () => {
  const { Wrapper, getAccess } = setup();
  let finish!: (value: typeof metadata) => void;
  getAccess.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = await renderHook(() => useMediaVideo(id), {
    wrapper: Wrapper,
  });
  let pending!: Promise<void>;
  await act(() => {
    pending = result.current.open();
  });
  await act(() => result.current.close());
  await act(async () => {
    finish(metadata);
    await pending;
  });
  expect(result.current.state.status).toBe("idle");
  expect(mockAllocate).not.toHaveBeenCalled();
  expect(mockDownload).not.toHaveBeenCalled();
});

test.each(["unavailable", "playback"] as const)(
  "native %s reports a safe error and releases playback",
  async (reason) => {
    const { Wrapper } = setup();
    const screen = await render(
      <Wrapper>
        <MediaVideoCard mediaId={id} filename={null} />
      </Wrapper>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "첨부 동영상 재생" }),
    );
    await flush();
    await act(() => screen.getByTestId("native-player").props.onError(reason));
    expect(screen.queryByTestId("native-player")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      reason === "unavailable" ? /새 네이티브 빌드/ : /재생하지 못했습니다/,
    );
    expect(mockRemove).toHaveBeenCalledWith("file:///owned/1-video.mp4");
  },
);

test("without a signed-in runtime the video card is visible but unavailable", async () => {
  const screen = await render(
    <AppThemeProvider>
      <MediaVideoCard mediaId={id} filename={null} />
    </AppThemeProvider>,
  );
  expect(
    screen.getByRole("button", { name: "첨부 동영상 재생" }),
  ).toBeDisabled();
  expect(mockDownload).not.toHaveBeenCalled();
});
