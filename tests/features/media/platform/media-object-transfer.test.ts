import { File } from "expo-file-system";
import {
  createNativeMediaObjectPutPort,
  downloadToFile,
} from "@/features/media/platform/media-object-transfer";

const mockFetch = jest.fn();
const mockPut = jest.fn();
jest.mock("@/features/media/platform/native-file-put", () => ({
  putNativeFile: (...args: unknown[]) => mockPut(...args),
}));
const mockWrite = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockAbort = jest.fn().mockResolvedValue(undefined);
const mockRemove = jest.fn();
jest.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    size = 10;
    exists: boolean;
    constructor(uri: string) {
      this.uri = uri;
      this.exists = uri.includes("/staged/");
    }
    create() {
      this.exists = true;
    }
    writableStream() {
      return {
        getWriter: () => ({
          write: mockWrite,
          close: mockClose,
          abort: mockAbort,
          releaseLock: jest.fn(),
        }),
      };
    }
  },
}));
jest.mock("@/features/media/platform/media-staging", () => ({
  isOwnedStagedFile: (uri: string) => uri.startsWith("file:///owned/staged/"),
}));
jest.mock("@/features/media/platform/media-downloads", () => ({
  isOwnedDownloadFile: (uri: string) =>
    uri.startsWith("file:///owned/downloads/"),
  removeDownloadedFile: (uri: string) => mockRemove(uri),
}));
const url = "https://media.example/objects/signed?x=A%2FB&x=2";
const file = {
  uri: "file:///owned/staged/a.jpg",
  name: "a.jpg",
  byteSize: 10,
  contentType: "image/jpeg",
  width: null,
  height: null,
};
const put = (signal = new AbortController().signal, onProgress = jest.fn()) =>
  createNativeMediaObjectPutPort().put({ url, file, signal, onProgress });

function streamed(chunks: number[][], length: string | null = null) {
  const queue = chunks.map((value) => new Uint8Array(value));
  const reader = {
    read: jest.fn(async () =>
      queue.length
        ? { done: false, value: queue.shift()! }
        : { done: true, value: undefined },
    ),
    cancel: jest.fn().mockResolvedValue(undefined),
    releaseLock: jest.fn(),
  };
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => length },
    body: { getReader: () => reader },
  });
  return reader;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockPut.mockReset();
});

test("PUT passes only signed URL and exact file metadata to native code, never a JS body or API headers", async () => {
  mockPut.mockResolvedValue({ status: 200 });
  const progress = jest.fn();
  await put(undefined, progress);
  expect(mockPut).toHaveBeenCalledWith({
    url,
    uri: file.uri,
    byteSize: 10,
    contentType: "image/jpeg",
    signal: expect.any(AbortSignal),
  });
  expect(mockFetch).not.toHaveBeenCalled();
  expect(progress.mock.calls).toEqual([
    [0, 10],
    [10, 10],
  ]);
});
test("403 remains a status for explicit fresh-intent recovery, never fake progress completion", async () => {
  mockPut.mockResolvedValue({ status: 403 });
  const progress = jest.fn();
  await expect(put(undefined, progress)).resolves.toEqual({ status: 403 });
  expect(progress.mock.calls).toEqual([[0, 10]]);
});
test("PUT rejects non-owned or changed files before a request", async () => {
  const port = createNativeMediaObjectPutPort();
  await expect(
    port.put({
      url,
      file: { ...file, uri: "file:///original/a.jpg" },
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("invalid_file");
  await expect(
    port.put({
      url,
      file: { ...file, byteSize: 11 },
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("invalid_file");
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockPut).not.toHaveBeenCalled();
});
test("parent cancellation reaches the native PUT and drops a late response", async () => {
  let finish!: (value: unknown) => void;
  mockPut.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const controller = new AbortController();
  const pending = put(controller.signal);
  controller.abort();
  expect(mockPut.mock.calls[0][0].signal.aborted).toBe(true);
  finish({ status: 200 });
  await expect(pending).rejects.toThrow("cancelled");
});
test("native file rejection remains typed and never leaks native error text", async () => {
  mockPut.mockRejectedValue({
    code: "ERR_FILE_PUT_INVALID_FILE",
    message: "private uri",
  });
  await expect(put()).rejects.toThrow(/^invalid_file$/);
});
test("already aborted requests never start native PUT", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(put(controller.signal)).rejects.toThrow("cancelled");
  expect(mockPut).not.toHaveBeenCalled();
});
test("download streams bounded chunks, with no API headers/cookies/redirect and exact expected size", async () => {
  streamed(
    [
      [1, 2],
      [3, 4, 5],
    ],
    "5",
  );
  const destination = new File("file:///owned/downloads/a.jpg");
  await expect(
    downloadToFile({ url, destination, expectedBytes: 5 }),
  ).resolves.toEqual({ byteSize: 5 });
  expect(mockFetch).toHaveBeenCalledWith(
    url,
    expect.objectContaining({
      method: "GET",
      credentials: "omit",
      redirect: "error",
    }),
  );
  expect(mockFetch.mock.calls[0][1].headers).toBeUndefined();
  expect(mockWrite.mock.calls.map(([chunk]) => Array.from(chunk))).toEqual([
    [1, 2],
    [3, 4, 5],
  ]);
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockRemove).not.toHaveBeenCalled();
});
test.each(["oversize", "wrong-size", "header"])(
  "download %s cancels the stream and removes only its partial owned file",
  async (mode) => {
    const reader = streamed(
      [
        [1, 2],
        [3, 4, 5],
      ],
      mode === "header" ? "500" : null,
    );
    const destination = new File("file:///owned/downloads/a.jpg");
    await expect(
      downloadToFile({
        url,
        destination,
        maxBytes: 4,
        ...(mode === "wrong-size" ? { maxBytes: 10, expectedBytes: 6 } : {}),
      }),
    ).rejects.toThrow("size_limit");
    expect(reader.cancel).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith(destination.uri);
  },
);
test("non-owned destination and HTTP redirect/missing body never become an image", async () => {
  await expect(
    downloadToFile({ url, destination: new File("file:///original/a") }),
  ).rejects.toThrow("invalid_file");
  expect(mockFetch).not.toHaveBeenCalled();
  mockFetch.mockResolvedValue({ ok: false, status: 307, body: null });
  await expect(
    downloadToFile({ url, destination: new File("file:///owned/downloads/a") }),
  ).rejects.toThrow("http_status");
});
test("transfer deadline aborts a stuck native request", async () => {
  jest.useFakeTimers();
  mockPut.mockImplementation(
    (init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  );
  try {
    const pending = put();
    const rejected = expect(pending).rejects.toThrow("cancelled");
    await jest.advanceTimersByTimeAsync(120_000);
    await rejected;
  } finally {
    jest.useRealTimers();
  }
});
