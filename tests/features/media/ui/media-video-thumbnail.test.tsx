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

const mockDownload = jest.fn();
const mockThumbnail = jest.fn();
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
jest.mock("@/features/media/platform/media-object-transfer", () => ({
  downloadToFile: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock("@/features/media/platform/media-downloads", () => ({
  allocateDownloadDestination: () => mockAllocate(),
  removeDownloadedFile: (uri: string) => mockRemove(uri),
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
  mockFocused = true;
  mockDownload.mockReset().mockResolvedValue(undefined);
  mockThumbnail.mockReset().mockResolvedValue("file:///owned/thumbnail.jpg");
  let next = 0;
  mockAllocate
    .mockReset()
    .mockImplementation(() => ({ uri: `file:///owned/${++next}.mp4` }));
});

test("off-screen cards do no work; visible cards authorize then extract from a bounded local MP4", async () => {
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
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/1.mp4");
  await hook.rerender({ enabled: false });
  expect(hook.result.current.state).toBeNull();
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/thumbnail.jpg");
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

test("thumbnail failure is retryable once and never disables explicit playback", async () => {
  const { Wrapper } = setup();
  mockThumbnail.mockRejectedValue(new Error(metadata.url));
  const screen = await render(
    <Wrapper>
      <MediaVideoCard mediaId={id} filename="video.mp4" thumbnailEnabled />
    </Wrapper>,
  );
  await flush();
  const retry = screen.getByRole("button", {
    name: "video.mp4 미리보기 다시 시도",
  });
  expect(screen.getByRole("button", { name: "video.mp4 재생" })).toBeEnabled();
  expect(screen.queryByText(/private\?signature/)).toBeNull();
  await fireEvent.press(retry);
  await flush();
  expect(
    screen.getByRole("button", { name: "video.mp4 미리보기 다시 시도" }),
  ).toBeDisabled();
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
  expect(image.props.source).toEqual({ uri: "file:///owned/thumbnail.jpg" });
  expect(image.props.resizeMode).toBe("cover");
  await fireEvent(image, "error");
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
  expect(hook.result.current.canRetry).toBe(false);
});
