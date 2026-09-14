import { createNativeVideoThumbnail } from "@/features/media/platform/native-video-thumbnail";

const mockLoad = jest.fn();
const mockManipulate = jest.fn();
const mockOwned = jest.fn();
const mockHold = jest.fn();
const mockDelete = jest.fn();
const mockRemove = jest.fn();
const mockCopy = jest.fn();
let mockSize = 100;
jest.mock("expo", () => ({
  requireNativeModule: () => ({ manipulate: mockManipulate }),
}));
jest.mock("@/features/media/platform/native-video-player", () => ({
  loadNativeVideoApi: () => mockLoad(),
}));
jest.mock("@/features/media/platform/media-downloads", () => ({
  isOwnedDownloadFile: (uri: string) => mockOwned(uri),
  retainDownloadedFile: () => mockHold(),
  removeDownloadedFile: (uri: string) => mockRemove(uri),
  allocateDownloadDestination: () => ({
    uri: "file:///cache/media-downloads/thumb.jpg",
  }),
}));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  Directory: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/") + "/";
    }
  },
  File: class {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    get size() {
      return mockSize;
    }
    delete() {
      mockDelete(this.uri);
    }
    copy(destination: unknown) {
      return mockCopy(destination);
    }
  },
}));
const source = "file:///cache/media-downloads/movie.mp4";
const generated =
  "file:///cache/ImageManipulator/11111111-1111-4111-8111-111111111111.jpg";
function setup() {
  const frame = { release: jest.fn() };
  const player = {
    replaceAsync: jest.fn().mockResolvedValue(undefined),
    generateThumbnailsAsync: jest.fn().mockResolvedValue([frame]),
    release: jest.fn(),
    play: jest.fn(),
  };
  const image = {
    saveAsync: jest.fn().mockResolvedValue({ uri: generated }),
    release: jest.fn(),
  };
  const context = {
    renderAsync: jest.fn().mockResolvedValue(image),
    release: jest.fn(),
  };
  mockLoad.mockReturnValue({ createVideoPlayer: () => player });
  mockManipulate.mockReturnValue(context);
  const releaseFile = jest.fn();
  mockHold.mockReturnValue(releaseFile);
  return { frame, player, image, context, releaseFile };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockCopy.mockReset();
  mockCopy.mockResolvedValue(undefined);
  mockSize = 100;
  mockOwned.mockReturnValue(true);
});

test("uses a timestamp array accepted by the installed iOS and Android native bridges", async () => {
  const { player } = setup();
  const frame = { release: jest.fn() };
  // The SDK type admits number | number[], but Swift [CMTime] and Kotlin
  // List<Duration> reject a scalar. Model the actual bridge, not the TS union.
  player.generateThumbnailsAsync.mockImplementation(async (times: unknown) => {
    if (!Array.isArray(times))
      throw new Error("Cannot convert number to array");
    return [frame];
  });
  await expect(
    createNativeVideoThumbnail(source, new AbortController().signal),
  ).resolves.toBe("file:///cache/media-downloads/thumb.jpg");
  expect(player.generateThumbnailsAsync).toHaveBeenCalledWith([0], {
    maxWidth: 320,
    maxHeight: 320,
  });
  expect(frame.release).toHaveBeenCalledTimes(1);
});

test("extracts a bounded native JPEG without playback/base64 and releases the decoder before the source", async () => {
  const { frame, player, image, context, releaseFile } = setup();
  const result = await createNativeVideoThumbnail(
    source,
    new AbortController().signal,
  );
  expect(result).toBe("file:///cache/media-downloads/thumb.jpg");
  expect(player.replaceAsync).toHaveBeenCalledWith({
    uri: source,
    useCaching: false,
  });
  expect(player.generateThumbnailsAsync).toHaveBeenCalledWith([0], {
    maxWidth: 320,
    maxHeight: 320,
  });
  expect(player.play).not.toHaveBeenCalled();
  expect(player).toMatchObject({
    muted: true,
    allowsExternalPlayback: false,
    staysActiveInBackground: false,
  });
  expect(mockManipulate).toHaveBeenCalledWith(frame);
  expect(image.saveAsync).toHaveBeenCalledWith({
    format: "jpeg",
    compress: 0.8,
    base64: false,
  });
  expect(mockDelete).toHaveBeenCalledWith(generated);
  for (const release of [
    frame.release,
    image.release,
    context.release,
    player.release,
    releaseFile,
  ])
    expect(release).toHaveBeenCalledTimes(1);
  expect(player.release.mock.invocationCallOrder[0]).toBeLessThan(
    releaseFile.mock.invocationCallOrder[0],
  );
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("keeps the generated JPEG alive and does not publish a thumbnail until the native copy finishes", async () => {
  const { player, releaseFile } = setup();
  const copying = deferred();
  const started = deferred();
  mockCopy.mockImplementation(() => {
    started.resolve();
    return copying.promise;
  });
  let published = false;
  const thumbnail = createNativeVideoThumbnail(
    source,
    new AbortController().signal,
  ).then((uri) => {
    published = true;
    return uri;
  });
  await started.promise;
  try {
    expect(mockDelete).not.toHaveBeenCalled();
    expect(player.release).not.toHaveBeenCalled();
    expect(releaseFile).not.toHaveBeenCalled();
    expect(published).toBe(false);
  } finally {
    copying.resolve();
    await thumbnail;
  }
  expect(await thumbnail).toBe("file:///cache/media-downloads/thumb.jpg");
  expect(mockDelete).toHaveBeenCalledWith(generated);
});

test("handles an asynchronous native copy rejection without exposing paths or returning an unusable URI", async () => {
  setup();
  const copying = deferred();
  const started = deferred();
  // Observe the test-owned Promise so the pre-fix implementation's floating
  // rejection is reported by an assertion, not Jest's unhandled-rejection hook.
  void copying.promise.catch(() => undefined);
  mockCopy.mockImplementation(() => {
    started.resolve();
    return copying.promise;
  });
  const result = createNativeVideoThumbnail(
    source,
    new AbortController().signal,
  ).then(
    (uri) => ({ uri }),
    (error: Error) => ({ error: error.message }),
  );
  await started.promise;
  copying.reject(new Error("FileSystemFile.copy: private native path"));
  expect(await result).toEqual({ error: "thumbnail_unavailable" });
  expect(mockRemove).toHaveBeenCalledWith(
    "file:///cache/media-downloads/thumb.jpg",
  );
  expect(mockDelete).toHaveBeenCalledWith(generated);
});

test("cancellation during an in-flight copy waits before removing its source and partial destination", async () => {
  const { releaseFile } = setup();
  const copying = deferred();
  const started = deferred();
  const controller = new AbortController();
  mockCopy.mockImplementation(() => {
    started.resolve();
    return copying.promise;
  });
  const result = createNativeVideoThumbnail(source, controller.signal).then(
    (uri) => ({ uri }),
    (error: Error) => ({ error: error.message }),
  );
  await started.promise;
  controller.abort();
  try {
    expect(mockDelete).not.toHaveBeenCalled();
    expect(releaseFile).not.toHaveBeenCalled();
  } finally {
    copying.resolve();
    await result;
  }
  expect(await result).toEqual({ error: "thumbnail_unavailable" });
  expect(mockRemove).toHaveBeenCalledWith(
    "file:///cache/media-downloads/thumb.jpg",
  );
  expect(mockDelete).toHaveBeenCalledWith(generated);
});

test.each(["https://media.example/private", "file:///user/original.mp4"])(
  "rejects non-owned input %s",
  async (uri) => {
    setup();
    mockOwned.mockReturnValue(false);
    await expect(
      createNativeVideoThumbnail(uri, new AbortController().signal),
    ).rejects.toThrow("invalid_thumbnail_source");
    expect(mockHold).not.toHaveBeenCalled();
  },
);

test("missing native support is a recoverable thumbnail failure", async () => {
  setup();
  mockLoad.mockReturnValue(null);
  await expect(
    createNativeVideoThumbnail(source, new AbortController().signal),
  ).rejects.toThrow("thumbnail_unavailable");
  expect(mockHold).not.toHaveBeenCalled();
});

test.each([
  "file:///user/original.jpg",
  "file:///cache/ImageManipulator/../original.jpg",
])("never deletes an unexpected output %s", async (uri) => {
  const { image, player, releaseFile } = setup();
  image.saveAsync.mockResolvedValue({ uri });
  await expect(
    createNativeVideoThumbnail(source, new AbortController().signal),
  ).rejects.toThrow("thumbnail_unavailable");
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockCopy).not.toHaveBeenCalled();
  expect(player.release).toHaveBeenCalled();
  expect(releaseFile).toHaveBeenCalled();
});

test.each([0, 1_048_577])(
  "rejects invalid generated size %s and cleans the native output",
  async (size) => {
    setup();
    mockSize = size;
    await expect(
      createNativeVideoThumbnail(source, new AbortController().signal),
    ).rejects.toThrow("thumbnail_unavailable");
    expect(mockCopy).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(generated);
  },
);

test("late save after cancellation deletes only its generated cache output", async () => {
  const { image, releaseFile } = setup();
  const controller = new AbortController();
  image.saveAsync.mockImplementation(async () => {
    controller.abort();
    return { uri: generated };
  });
  await expect(
    createNativeVideoThumbnail(source, controller.signal),
  ).rejects.toThrow("thumbnail_unavailable");
  expect(mockDelete).toHaveBeenCalledWith(generated);
  expect(mockCopy).not.toHaveBeenCalled();
  expect(releaseFile).toHaveBeenCalled();
});

test.each(["copy failure", "cancellation after copy"])(
  "%s removes a partial owned thumbnail and releases the source",
  async (reason) => {
    const { player, releaseFile } = setup();
    const controller = new AbortController();
    mockCopy.mockImplementation(() => {
      if (reason === "copy failure") throw new Error("private native path");
      controller.abort();
    });
    await expect(
      createNativeVideoThumbnail(source, controller.signal),
    ).rejects.toThrow("thumbnail_unavailable");
    expect(mockRemove).toHaveBeenCalledWith(
      "file:///cache/media-downloads/thumb.jpg",
    );
    expect(mockDelete).toHaveBeenCalledWith(generated);
    expect(player.release).toHaveBeenCalledTimes(1);
    expect(releaseFile).toHaveBeenCalledTimes(1);
  },
);

test("decoder errors and throwing teardown still release remaining owners", async () => {
  const { frame, image, context, player, releaseFile } = setup();
  frame.release.mockImplementation(() => {
    throw new Error("native path");
  });
  image.saveAsync.mockRejectedValue(new Error("private path"));
  await expect(
    createNativeVideoThumbnail(source, new AbortController().signal),
  ).rejects.toThrow("thumbnail_unavailable");
  expect(context.release).toHaveBeenCalled();
  expect(player.release).toHaveBeenCalled();
  expect(releaseFile).toHaveBeenCalled();
});

test("aborted work never creates native resources; empty frames also clean up", async () => {
  const { player, releaseFile } = setup();
  const controller = new AbortController();
  controller.abort();
  await expect(
    createNativeVideoThumbnail(source, controller.signal),
  ).rejects.toThrow("thumbnail_cancelled");
  expect(mockLoad).not.toHaveBeenCalled();
  player.generateThumbnailsAsync.mockResolvedValue([]);
  await expect(
    createNativeVideoThumbnail(source, new AbortController().signal),
  ).rejects.toThrow("thumbnail_unavailable");
  expect(releaseFile).toHaveBeenCalled();
});
