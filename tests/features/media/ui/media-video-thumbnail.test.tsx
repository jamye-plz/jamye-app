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
import { useMediaVideoThumbnail } from "@/features/media/ui/use-media-video-thumbnail";
import { MediaVideoCard } from "@/features/media/ui/media-video-card";
import { MAX_VIDEO_BYTES } from "@/features/media/model/media-policy";
import { invalidateThumbnailCache } from "@/features/media/model/video-thumbnail-cache";
import { invalidateMediaObjectCache } from "@/features/media/platform/media-object-cache";

const mockDownload = jest.fn();
const mockThumbnail = jest.fn();
const mockRemove = jest.fn();
const mockAllocate = jest.fn();
const mockLog = jest.fn();
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
jest.mock("@/core/logging/logger", () => ({
  createLogger: () => ({
    log: (event: string, severity: string, metadata: unknown) =>
      mockLog(event, severity, metadata),
  }),
}));
jest.mock("@/features/media/platform/media-object-transfer", () => ({
  downloadToFile: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock("@/features/media/platform/media-downloads", () => ({
  allocateDownloadDestination: () => mockAllocate(),
  removeDownloadedFile: (uri: string) => mockRemove(uri),
  retainDownloadedFile: (uri: string) => () => mockRemove(uri),
}));
jest.mock("@/features/media/platform/native-video-thumbnail", () => ({
  createNativeVideoThumbnail: (...args: unknown[]) => mockThumbnail(...args),
}));
jest.mock("@/features/media/platform/native-video-player", () => ({
  NativeVideoPlayer: () => null,
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaProvider: View, SafeAreaView: View };
});
const id = "11111111-1111-4111-8111-111111111111";
const metadata = {
  id,
  url: "https://media.example/private?signature",
  byteSize: 10,
  contentType: "video/mp4",
};
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
      execute("api-bearer", signal ?? new AbortController().signal),
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
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  invalidateThumbnailCache("account-one");
  invalidateMediaObjectCache();
  mockFocused = true;
  mockDownload.mockReset().mockResolvedValue(undefined);
  mockThumbnail.mockReset().mockResolvedValue("file:///owned/thumbnail.jpg");
  let next = 0;
  mockAllocate
    .mockReset()
    .mockImplementation(() => ({ uri: `file:///owned/${++next}.mp4` }));
});

test("off-screen cards do no work; visible cards authorize then extract from a bounded local MP4", async () => {
  jest.useFakeTimers();
  const { Wrapper, getAccess } = setup();
  const hook = await renderHook(
    ({ enabled }: { enabled: boolean }) => useMediaVideoThumbnail(id, enabled),
    { initialProps: { enabled: false }, wrapper: Wrapper },
  );
  await flush();
  expect(getAccess).not.toHaveBeenCalled();
  await hook.rerender({ enabled: true });
  await flush();
  expect(mockDownload).toHaveBeenCalledWith(
    expect.objectContaining({
      url: metadata.url,
      maxBytes: MAX_VIDEO_BYTES,
      expectedBytes: 10,
    }),
  );
  expect(mockThumbnail).toHaveBeenCalledWith(
    "file:///owned/1.mp4",
    expect.any(AbortSignal),
  );
  expect(hook.result.current.state).toEqual({
    status: "ready",
    uri: "file:///owned/thumbnail.jpg",
  });
  // Behavior change (A1/deliverable 6): the downloaded source video is shared with
  // playback through the object cache and is only released RETENTION_MS after the
  // last release, not removed immediately here.
  expect(mockRemove).not.toHaveBeenCalledWith("file:///owned/1.mp4");
  await hook.rerender({ enabled: false });
  expect(hook.result.current.state).toBeNull();
  // Behavior change (A1/deliverable 4): a card going off-screen keeps its ready
  // thumbnail alive for a 5s grace window instead of tearing it down immediately.
  expect(mockRemove).not.toHaveBeenCalledWith("file:///owned/thumbnail.jpg");
  await act(() => jest.advanceTimersByTime(5_000));
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/thumbnail.jpg");
  await hook.unmount();
  jest.useRealTimers();
});

test("re-enabling within the 5s grace window reuses the same job instead of restarting it", async () => {
  jest.useFakeTimers();
  const { Wrapper } = setup();
  const hook = await renderHook(
    ({ enabled }: { enabled: boolean }) => useMediaVideoThumbnail(id, enabled),
    { initialProps: { enabled: true }, wrapper: Wrapper },
  );
  await flush();
  expect(hook.result.current.state).toEqual({
    status: "ready",
    uri: "file:///owned/thumbnail.jpg",
  });
  await hook.rerender({ enabled: false });
  await act(() => jest.advanceTimersByTime(4_000));
  await hook.rerender({ enabled: true });
  await flush();
  expect(hook.result.current.state).toEqual({
    status: "ready",
    uri: "file:///owned/thumbnail.jpg",
  });
  expect(mockDownload).toHaveBeenCalledTimes(1);
  expect(mockThumbnail).toHaveBeenCalledTimes(1);
  await hook.unmount();
  jest.useRealTimers();
});

test("concurrent visible cards serialize jobs and an aborted queued card never authorizes", async () => {
  const { Wrapper, getAccess } = setup();
  let finish!: () => void;
  mockDownload.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const one = await renderHook(() => useMediaVideoThumbnail(id, true), {
    wrapper: Wrapper,
  });
  await flush();
  const two = await renderHook(() => useMediaVideoThumbnail("other", true), {
    wrapper: Wrapper,
  });
  await flush();
  expect(getAccess).toHaveBeenCalledTimes(1);
  await two.unmount();
  await act(() => finish());
  await flush();
  expect(getAccess).toHaveBeenCalledTimes(1);
  await one.unmount();
});

test.each([
  { id: "wrong" },
  { contentType: "image/jpeg" },
  { byteSize: MAX_VIDEO_BYTES + 1 },
  { byteSize: 0 },
  { byteSize: 1.5 },
])("invalid MD4 metadata fails before object I/O: %o", async (invalid) => {
  const { Wrapper, getAccess } = setup();
  getAccess.mockResolvedValue({ ...metadata, ...invalid });
  const hook = await renderHook(() => useMediaVideoThumbnail(id, true), {
    wrapper: Wrapper,
  });
  await flush();
  expect(hook.result.current.state?.status).toBe("error");
  expect(mockDownload).not.toHaveBeenCalled();
});

test("late thumbnail completion after background is discarded and cleaned", async () => {
  const { Wrapper, lifetime } = setup();
  let finish!: (uri: string) => void;
  mockThumbnail.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const hook = await renderHook(() => useMediaVideoThumbnail(id, true), {
    wrapper: Wrapper,
  });
  await flush();
  await act(() => lifetime.setForeground(false));
  await act(() => finish("file:///owned/late.jpg"));
  await flush();
  expect(hook.result.current.state).toBeNull();
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/late.jpg");
});

test("blur before authorization returns prevents downloads; refocus starts fresh", async () => {
  const { Wrapper, getAccess } = setup();
  let finish!: (value: typeof metadata) => void;
  getAccess.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = await renderHook(() => useMediaVideoThumbnail(id, true), {
    wrapper: Wrapper,
  });
  await flush();
  mockFocused = false;
  await hook.rerender(undefined);
  await act(() => finish(metadata));
  await flush();
  expect(mockDownload).not.toHaveBeenCalled();
  mockFocused = true;
  await hook.rerender(undefined);
  await flush();
  expect(hook.result.current.state?.status).toBe("ready");
});

test("thumbnail failure is retryable up to 3 times and never disables explicit playback", async () => {
  const { Wrapper } = setup();
  mockThumbnail.mockRejectedValue(new Error(metadata.url));
  const screen = await render(
    <Wrapper>
      <MediaVideoCard mediaId={id} filename="video.mp4" thumbnailEnabled />
    </Wrapper>,
  );
  await flush();
  expect(
    screen.getByRole("button", { name: "video.mp4 미리보기 다시 시도" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "video.mp4 재생" })).toBeEnabled();
  expect(screen.queryByText(/private\?signature/)).toBeNull();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await fireEvent.press(
      screen.getByRole("button", { name: "video.mp4 미리보기 다시 시도" }),
    );
    await flush();
  }
  expect(
    screen.getByRole("button", { name: "video.mp4 미리보기 다시 시도" }),
  ).toBeDisabled();
  expect(mockThumbnail).toHaveBeenCalledTimes(4);
  await fireEvent.press(screen.getByRole("button", { name: "video.mp4 재생" }));
  await flush();
  expect(screen.getByRole("button", { name: "동영상 닫기" })).toBeTruthy();
});

test("a visible video card renders its local JPEG and keeps playback available after image failure", async () => {
  const { Wrapper } = setup();
  const screen = await render(
    <Wrapper>
      <MediaVideoCard mediaId={id} filename="video.mp4" thumbnailEnabled />
    </Wrapper>,
  );
  await flush();
  const image = screen.getByLabelText("video.mp4 영상 미리보기");
  expect(image.props.source).toEqual([{ uri: "file:///owned/thumbnail.jpg" }]);
  expect(image.props.contentFit).toBe("cover");
  await fireEvent(image, "error", { nativeEvent: { error: "decode" } });
  expect(screen.queryByLabelText("video.mp4 영상 미리보기")).toBeNull();
  expect(screen.getByRole("button", { name: "video.mp4 재생" })).toBeEnabled();
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/thumbnail.jpg");
});

test("a timed-out download aborts, reports a retryable error, and never extracts a late file", async () => {
  jest.useFakeTimers();
  const { Wrapper } = setup();
  let finish!: () => void;
  mockDownload.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const hook = await renderHook(() => useMediaVideoThumbnail(id, true), {
    wrapper: Wrapper,
  });
  try {
    await flush();
    await act(() => jest.advanceTimersByTime(120_000));
    expect(hook.result.current.state?.status).toBe("error");
    expect(hook.result.current.canRetry).toBe(true);
    // The shared object-cache download is only aborted once its own 60s retention
    // window elapses with no remaining acquirer, independent of this job's watchdog.
    await act(() => jest.advanceTimersByTime(60_000));
    expect(mockDownload.mock.calls[0][0].signal.aborted).toBe(true);
    await act(() => finish());
    await flush();
    expect(mockThumbnail).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith("file:///owned/1.mp4");
  } finally {
    finish();
    await hook.unmount();
    jest.useRealTimers();
  }
});

test("a local thumbnail decode error has bounded retry and removes its owned file", async () => {
  const { Wrapper } = setup();
  const hook = await renderHook(() => useMediaVideoThumbnail(id, true), {
    wrapper: Wrapper,
  });
  await flush();
  await act(() => hook.result.current.imageFailed());
  expect(hook.result.current.state?.status).toBe("error");
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/thumbnail.jpg");
  await act(() => hook.result.current.retry());
  await flush();
  expect(hook.result.current.state?.status).toBe("ready");
  expect(hook.result.current.canRetry).toBe(true);
  await act(() => hook.result.current.imageFailed());
  await act(() => hook.result.current.retry());
  await flush();
  await act(() => hook.result.current.imageFailed());
  await act(() => hook.result.current.retry());
  await flush();
  expect(hook.result.current.state?.status).toBe("ready");
  expect(hook.result.current.canRetry).toBe(false);
});

const posterId = "22222222-2222-4222-8222-222222222222";
const posterMetadata = {
  id: posterId,
  url: "https://media.example/poster?signature",
  byteSize: 2_048,
  contentType: "image/jpeg",
};
function mockPosterAndVideoAccess(
  getAccess: jest.Mock,
  posterOverride: Record<string, unknown> = {},
) {
  getAccess.mockImplementation((_token: string, requestedId: string) =>
    Promise.resolve(
      requestedId === posterId
        ? { ...posterMetadata, ...posterOverride }
        : metadata,
    ),
  );
}

test("a video with a posterMediaId downloads only the poster JPEG and skips frame extraction", async () => {
  const { Wrapper, getAccess } = setup();
  mockPosterAndVideoAccess(getAccess);
  const hook = await renderHook(
    () => useMediaVideoThumbnail(id, true, posterId),
    { wrapper: Wrapper },
  );
  await flush();
  expect(getAccess).toHaveBeenCalledTimes(1);
  expect(getAccess.mock.calls[0][1]).toBe(posterId);
  expect(mockDownload).toHaveBeenCalledTimes(1);
  expect(mockDownload).toHaveBeenCalledWith(
    expect.objectContaining({
      url: posterMetadata.url,
      maxBytes: 1_048_576,
      expectedBytes: 2_048,
    }),
  );
  expect(mockThumbnail).not.toHaveBeenCalled();
  expect(hook.result.current.state).toEqual({
    status: "ready",
    uri: "file:///owned/1.mp4",
  });
});

test.each([
  { id: "wrong-poster-id" },
  { contentType: "video/mp4" },
  { byteSize: 1_048_577 },
  { byteSize: 0 },
])(
  "invalid poster metadata is rejected before download and falls back to legacy generation: %o",
  async (invalid) => {
    const { Wrapper, getAccess } = setup();
    mockPosterAndVideoAccess(getAccess, invalid);
    const hook = await renderHook(
      () => useMediaVideoThumbnail(id, true, posterId),
      { wrapper: Wrapper },
    );
    await flush();
    expect(mockLog).toHaveBeenCalledWith(
      "media.video-thumbnail.failed",
      "warn",
      expect.objectContaining({ mediaId: id, stage: "poster" }),
    );
    // The guard rejects before any I/O: only the legacy fallback's single
    // download/allocate/extract triple runs.
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({ url: metadata.url }),
    );
    expect(mockThumbnail).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).toEqual({
      status: "ready",
      uri: "file:///owned/thumbnail.jpg",
    });
  },
);

test("a poster download failure falls back to legacy generation exactly once", async () => {
  const { Wrapper, getAccess } = setup();
  mockPosterAndVideoAccess(getAccess);
  mockDownload.mockRejectedValueOnce(new Error("network_down"));
  const hook = await renderHook(
    () => useMediaVideoThumbnail(id, true, posterId),
    { wrapper: Wrapper },
  );
  await flush();
  expect(mockDownload).toHaveBeenCalledTimes(2);
  expect(mockDownload.mock.calls[0][0]).toEqual(
    expect.objectContaining({ url: posterMetadata.url }),
  );
  expect(mockDownload.mock.calls[1][0]).toEqual(
    expect.objectContaining({ url: metadata.url }),
  );
  expect(mockThumbnail).toHaveBeenCalledTimes(1);
  expect(mockLog).toHaveBeenCalledWith(
    "media.video-thumbnail.failed",
    "warn",
    expect.objectContaining({ mediaId: id, stage: "poster" }),
  );
  expect(hook.result.current.state).toEqual({
    status: "ready",
    uri: "file:///owned/thumbnail.jpg",
  });
});

test("passing posterMediaId as null behaves exactly like the legacy two-argument call", async () => {
  const { Wrapper, getAccess } = setup();
  const hook = await renderHook(() => useMediaVideoThumbnail(id, true, null), {
    wrapper: Wrapper,
  });
  await flush();
  expect(getAccess).toHaveBeenCalledTimes(1);
  expect(getAccess.mock.calls[0][1]).toBe(id);
  expect(mockThumbnail).toHaveBeenCalledTimes(1);
  expect(hook.result.current.state).toEqual({
    status: "ready",
    uri: "file:///owned/thumbnail.jpg",
  });
});

test("account invalidation clears poster cache entries (cached poster file is removed)", async () => {
  const { Wrapper, lifetime, getAccess } = setup();
  mockPosterAndVideoAccess(getAccess);
  const hook = await renderHook(
    () => useMediaVideoThumbnail(id, true, posterId),
    { wrapper: Wrapper },
  );
  await flush();
  expect(hook.result.current.state).toEqual({
    status: "ready",
    uri: "file:///owned/1.mp4",
  });
  await act(() => lifetime.dispose());
  await flush();
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/1.mp4");
  expect(hook.result.current.state).toBeNull();
});

test("a video card with posterMediaId renders the downloaded poster JPEG through the same frozen image label", async () => {
  const { Wrapper, getAccess } = setup();
  mockPosterAndVideoAccess(getAccess);
  const screen = await render(
    <Wrapper>
      <MediaVideoCard
        mediaId={id}
        filename="video.mp4"
        thumbnailEnabled
        posterMediaId={posterId}
      />
    </Wrapper>,
  );
  await flush();
  const image = screen.getByLabelText("video.mp4 영상 미리보기");
  expect(image.props.source).toEqual([{ uri: "file:///owned/1.mp4" }]);
  expect(mockThumbnail).not.toHaveBeenCalled();
});
