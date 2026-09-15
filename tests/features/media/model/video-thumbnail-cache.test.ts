import {
  acquireThumbnail,
  canRetryThumbnail,
  invalidateThumbnailCache,
  markThumbnailImageFailed,
  retryThumbnail,
} from "@/features/media/model/video-thumbnail-cache";

const mockRemove = jest.fn();
jest.mock("@/features/media/platform/media-downloads", () => ({
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

const account = "account-one";

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  invalidateThumbnailCache(account);
  jest.useRealTimers();
});

test("a second card for the same mediaId reuses the in-flight job instead of regenerating", async () => {
  const job = jest.fn().mockResolvedValue("file:///owned/thumb.jpg");
  const one = acquireThumbnail(account, "media-1", job);
  const two = acquireThumbnail(account, "media-1", job);
  expect(one.state).toEqual({ status: "loading" });
  await expect(one.promise).resolves.toBe("file:///owned/thumb.jpg");
  await expect(two.promise).resolves.toBe("file:///owned/thumb.jpg");
  expect(job).toHaveBeenCalledTimes(1);
  one.release(true);
  const three = acquireThumbnail(account, "media-1", job);
  expect(three.state).toEqual({
    status: "ready",
    uri: "file:///owned/thumb.jpg",
  });
  expect(job).toHaveBeenCalledTimes(1);
  three.release(true);
  two.release(true);
});

test("grace period keeps the job alive so a quick disable/re-enable never restarts it", async () => {
  jest.useFakeTimers();
  const job = jest.fn().mockResolvedValue("file:///owned/thumb.jpg");
  const first = acquireThumbnail(account, "media-1", job);
  await first.promise;
  first.release();
  jest.advanceTimersByTime(4_000);
  const second = acquireThumbnail(account, "media-1", job);
  expect(job).toHaveBeenCalledTimes(1);
  expect(second.state).toEqual({
    status: "ready",
    uri: "file:///owned/thumb.jpg",
  });
  jest.advanceTimersByTime(5_000);
  expect(mockRemove).not.toHaveBeenCalled();
  second.release(true);
});

test("an immediate release cancels the job without waiting for the grace window", async () => {
  jest.useFakeTimers();
  let capturedController!: AbortController;
  const job = jest.fn().mockImplementation((controller: AbortController) => {
    capturedController = controller;
    return new Promise<string>(() => undefined);
  });
  const acquired = acquireThumbnail(account, "media-1", job);
  acquired.release(true);
  expect(capturedController.signal.aborted).toBe(true);
  const again = acquireThumbnail(account, "media-1", job);
  expect(job).toHaveBeenCalledTimes(2);
  again.release(true);
});

test("manual retry clears a failed result and is allowed 3 times", async () => {
  const job = jest
    .fn()
    .mockRejectedValue(
      new Error("thumbnail_unavailable:generate:frame_unavailable"),
    );
  const first = acquireThumbnail(account, "media-1", job);
  await expect(first.promise).rejects.toThrow();
  expect(canRetryThumbnail(account, "media-1")).toBe(true);
  expect(retryThumbnail(account, "media-1")).toBe(true);
  expect(retryThumbnail(account, "media-1")).toBe(true);
  expect(retryThumbnail(account, "media-1")).toBe(true);
  expect(canRetryThumbnail(account, "media-1")).toBe(false);
  expect(retryThumbnail(account, "media-1")).toBe(false);
  first.release(true);
});

test("marking a ready image as failed removes its file and clears the cache entry", async () => {
  const job = jest.fn().mockResolvedValue("file:///owned/thumb.jpg");
  const acquired = acquireThumbnail(account, "media-1", job);
  await acquired.promise;
  markThumbnailImageFailed(account, "media-1");
  expect(mockRemove).toHaveBeenCalledWith("file:///owned/thumb.jpg");
  const again = acquireThumbnail(account, "media-1", job);
  expect(again.state).toEqual({ status: "loading" });
  expect(job).toHaveBeenCalledTimes(2);
  acquired.release(true);
  again.release(true);
});

test("invalidation clears every cached entry for the account and aborts in-flight jobs", async () => {
  const ready = deferred<string>();
  let capturedController!: AbortController;
  const job = jest.fn().mockImplementation((controller: AbortController) => {
    capturedController = controller;
    return ready.promise;
  });
  const acquired = acquireThumbnail(account, "media-1", job);
  invalidateThumbnailCache(account);
  expect(capturedController.signal.aborted).toBe(true);
  const again = acquireThumbnail(account, "media-1", job);
  expect(again.state).toEqual({ status: "loading" });
  expect(job).toHaveBeenCalledTimes(2);
  acquired.release(true);
  again.release(true);
});

test("dropping a never-retried entry removes its slot from the account map to avoid unbounded growth", async () => {
  const deleteSpy = jest.spyOn(Map.prototype, "delete");
  const job = jest.fn().mockResolvedValue("file:///owned/thumb.jpg");
  const acquired = acquireThumbnail(account, "media-drop", job);
  await acquired.promise;
  acquired.release(true);
  expect(deleteSpy).toHaveBeenCalledWith("media-drop");
  expect(canRetryThumbnail(account, "media-drop")).toBe(true);
  deleteSpy.mockRestore();
});

test("dropping an entry with spent retries keeps its slot so retry accounting survives", async () => {
  const job = jest.fn().mockRejectedValue(new Error("boom"));
  const acquired = acquireThumbnail(account, "media-retry-keep", job);
  await expect(acquired.promise).rejects.toThrow("boom");
  const deleteSpy = jest.spyOn(Map.prototype, "delete");
  expect(retryThumbnail(account, "media-retry-keep")).toBe(true);
  expect(deleteSpy).not.toHaveBeenCalledWith("media-retry-keep");
  deleteSpy.mockRestore();
  acquired.release(true);
});
