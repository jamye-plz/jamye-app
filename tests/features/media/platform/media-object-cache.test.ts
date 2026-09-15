import {
  acquireMediaObject,
  invalidateMediaObjectCache,
} from "@/features/media/platform/media-object-cache";

const mockRetain = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/features/media/platform/media-downloads", () => ({
  retainDownloadedFile: (uri: string) => mockRetain(uri),
  removeDownloadedFile: (uri: string) => mockRemove(uri),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRetain.mockImplementation(() => jest.fn());
});

afterEach(() => {
  invalidateMediaObjectCache();
  jest.useRealTimers();
});

test("concurrent acquirers for the same mediaId share one in-flight load", async () => {
  const load = jest.fn().mockResolvedValue("file:///owned/video.mp4");
  const one = acquireMediaObject("media-1", load);
  const two = acquireMediaObject("media-1", load);
  await expect(one.uri).resolves.toBe("file:///owned/video.mp4");
  await expect(two.uri).resolves.toBe("file:///owned/video.mp4");
  expect(load).toHaveBeenCalledTimes(1);
  expect(mockRetain).toHaveBeenCalledWith("file:///owned/video.mp4");
  one.release(true);
  two.release(true);
});

test("releasing one acquirer never aborts another acquirer's still-active load", async () => {
  const pending = deferred<string>();
  const load = jest.fn().mockImplementation((signal: AbortSignal) => {
    void signal;
    return pending.promise;
  });
  const one = acquireMediaObject("media-1", load);
  const two = acquireMediaObject("media-1", load);
  one.release(true);
  pending.resolve("file:///owned/video.mp4");
  await expect(two.uri).resolves.toBe("file:///owned/video.mp4");
  two.release(true);
});

test("keeps the file for 60s after the last release so a quick reacquire reuses it", async () => {
  jest.useFakeTimers();
  const load = jest.fn().mockResolvedValue("file:///owned/video.mp4");
  const release = jest.fn();
  mockRetain.mockReturnValue(release);
  const first = acquireMediaObject("media-1", load);
  await first.uri;
  first.release();
  expect(release).not.toHaveBeenCalled();
  jest.advanceTimersByTime(59_000);
  const second = acquireMediaObject("media-1", load);
  await expect(second.uri).resolves.toBe("file:///owned/video.mp4");
  expect(load).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  second.release();
  jest.advanceTimersByTime(60_000);
  expect(release).toHaveBeenCalledTimes(1);
});

test("an immediate release skips the retention window", async () => {
  jest.useFakeTimers();
  const load = jest.fn().mockResolvedValue("file:///owned/video.mp4");
  const release = jest.fn();
  mockRetain.mockReturnValue(release);
  const acquired = acquireMediaObject("media-1", load);
  await acquired.uri;
  acquired.release(true);
  expect(release).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(60_000);
  expect(release).toHaveBeenCalledTimes(1);
});

test("preview then playback reuse the same downloaded file without a second load", async () => {
  const load = jest.fn().mockResolvedValue("file:///owned/preview.mp4");
  const preview = acquireMediaObject("media-1", load);
  await expect(preview.uri).resolves.toBe("file:///owned/preview.mp4");
  preview.release();
  const playback = acquireMediaObject("media-1", load);
  await expect(playback.uri).resolves.toBe("file:///owned/preview.mp4");
  expect(load).toHaveBeenCalledTimes(1);
  playback.release(true);
});

test("invalidation drops a ready entry and aborts an in-flight load immediately", async () => {
  const release = jest.fn();
  mockRetain.mockReturnValue(release);
  const ready = acquireMediaObject("media-ready", () =>
    Promise.resolve("file:///owned/ready.mp4"),
  );
  await ready.uri;

  const pending = deferred<string>();
  let capturedSignal: AbortSignal | undefined;
  const loading = acquireMediaObject("media-loading", (signal) => {
    capturedSignal = signal;
    return pending.promise;
  });
  void loading.uri.catch(() => undefined);

  invalidateMediaObjectCache();
  expect(release).toHaveBeenCalledTimes(1);
  expect(capturedSignal?.aborted).toBe(true);
});
