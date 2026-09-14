import {
  createMediaUploadController,
  type MediaUploadState,
} from "@/features/media/model/media-upload-controller";

const targetId = "88888888-8888-4888-8888-888888888888";
const uploadId = "77777777-7777-4777-8777-777777777777";

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function file(overrides: Partial<{ byteSize: number }> = {}) {
  return {
    uri: "file:///tmp/a.jpg",
    name: "a.jpg",
    byteSize: 1024,
    contentType: "image/jpeg",
    width: 100,
    height: 100,
    ...overrides,
  };
}

function finalizeResultFor(id: string) {
  return {
    scope: "chat" as const,
    bound: false as const,
    upload: {
      id,
      scope: "chat" as const,
      targetId,
      kind: "image" as const,
      contentType: "image/jpeg",
      byteSize: 1024,
      duration: null,
      filename: "a.jpg",
      confirmedAt: "2026-09-11T00:00:00Z",
    },
  };
}

describe("M11-2 media upload controller", () => {
  function setup(generation = "gen-1") {
    const createUpload = jest.fn();
    const finalizeUpload = jest.fn();
    const put = jest.fn();
    const cleanup = { deleteIfExists: jest.fn().mockResolvedValue(undefined) };
    let currentGeneration = generation;
    const states: { draftId: string; state: MediaUploadState }[] = [];
    const controller = createMediaUploadController({
      api: { createUpload, finalizeUpload },
      objectPut: { put },
      cleanup,
      authorize: (execute, signal) =>
        execute("token", signal ?? new AbortController().signal),
      getGeneration: () => currentGeneration,
    });
    controller.subscribe((draftId, state) => states.push({ draftId, state }));
    return {
      controller,
      createUpload,
      finalizeUpload,
      put,
      cleanup,
      states,
      setGeneration: (value: string) => {
        currentGeneration = value;
      },
    };
  }

  test("sequences MD1 -> PUT (with progress) -> MD2 to confirmed and cleans up the owned file", async () => {
    const { controller, createUpload, finalizeUpload, put, cleanup, states } =
      setup();
    const intent = deferred<{
      upload: { id: string };
      put: { url: string };
    }>();
    createUpload.mockReturnValue(intent.promise);
    const putCall = deferred<{ status: number }>();
    put.mockReturnValue(putCall.promise);
    const finalizeCall = deferred<ReturnType<typeof finalizeResultFor>>();
    finalizeUpload.mockReturnValue(finalizeCall.promise);

    controller.start({ draftId: "d1", scope: "chat", targetId, file: file() });
    expect(controller.getState("d1")?.status).toBe("requesting_intent");

    intent.resolve({
      upload: { id: uploadId },
      put: { url: "https://media.example.com/x?sig=1" },
    });
    await flush();
    expect(controller.getState("d1")).toMatchObject({
      status: "uploading",
      sentBytes: 0,
      totalBytes: 1024,
    });
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://media.example.com/x?sig=1",
      }),
    );

    const onProgress = put.mock.calls[0][0].onProgress;
    onProgress(512, 1024);
    expect(controller.getState("d1")).toMatchObject({
      status: "uploading",
      sentBytes: 512,
    });

    putCall.resolve({ status: 200 });
    await flush();
    expect(controller.getState("d1")?.status).toBe("finalizing");

    finalizeCall.resolve(finalizeResultFor(uploadId));
    await flush();
    expect(controller.getState("d1")).toMatchObject({ status: "confirmed" });
    expect(cleanup.deleteIfExists).toHaveBeenCalledWith("file:///tmp/a.jpg");
    expect(states.map((entry) => entry.state.status)).toEqual([
      "requesting_intent",
      "uploading",
      "uploading",
      "finalizing",
      "confirmed",
    ]);
  });

  test("a failed sibling can retry and be removed without reuploading or losing the confirmed attachment", async () => {
    const { controller, createUpload, finalizeUpload, put, cleanup } = setup();
    const secondId = "66666666-6666-4666-8666-666666666666";
    createUpload.mockResolvedValueOnce({
      upload: { id: uploadId },
      put: { url: "https://media.example/a" },
    });
    createUpload.mockResolvedValueOnce({
      upload: { id: secondId },
      put: { url: "https://media.example/b" },
    });
    put
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 200 });
    finalizeUpload.mockImplementation((_token, id) =>
      Promise.resolve(finalizeResultFor(id)),
    );
    controller.start({ draftId: "a", scope: "chat", targetId, file: file() });
    controller.start({
      draftId: "b",
      scope: "chat",
      targetId,
      file: { ...file(), uri: "file:///tmp/b.jpg" },
    });
    await flush();
    await flush();
    const first = controller.getState("a");
    expect(first?.status).toBe("confirmed");
    expect(controller.getState("b")?.status).toBe("put_failed");
    controller.retry("b");
    await flush();
    await flush();
    expect(controller.getState("b")?.status).toBe("confirmed");
    expect(controller.getState("a")).toBe(first);
    expect(createUpload).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(3);
    expect(finalizeUpload).toHaveBeenCalledTimes(2);
    controller.remove("b");
    expect(controller.getState("a")).toBe(first);
    expect(
      cleanup.deleteIfExists.mock.calls.filter(
        ([uri]) => uri === "file:///tmp/a.jpg",
      ),
    ).toHaveLength(1);
  });

  test("cancel during PUT aborts the signal and drops a late-arriving success", async () => {
    const { controller, createUpload, put, finalizeUpload } = setup();
    createUpload.mockResolvedValue({
      upload: { id: uploadId },
      put: { url: "https://media.example.com/x?sig=1" },
    });
    const putCall = deferred<{ status: number }>();
    let sawAbort = false;
    put.mockImplementation(({ signal }) => {
      signal.addEventListener("abort", () => {
        sawAbort = true;
      });
      return putCall.promise;
    });

    controller.start({ draftId: "d1", scope: "chat", targetId, file: file() });
    await flush();
    expect(controller.getState("d1")?.status).toBe("uploading");

    controller.cancel("d1");
    expect(controller.getState("d1")?.status).toBe("cancelled");
    expect(sawAbort).toBe(true);

    // The in-flight PUT still resolves successfully after cancellation; the
    // controller must not resurrect it into "finalizing"/"confirmed".
    putCall.resolve({ status: 200 });
    await flush();
    expect(controller.getState("d1")?.status).toBe("cancelled");
    expect(finalizeUpload).not.toHaveBeenCalled();
  });

  test("retry after a PUT failure reuses the same upload id and URL instead of a new MD1", async () => {
    const { controller, createUpload, put } = setup();
    createUpload.mockResolvedValue({
      upload: { id: uploadId },
      put: { url: "https://media.example.com/x?sig=1" },
    });
    put.mockResolvedValueOnce({ status: 500 });

    controller.start({ draftId: "d1", scope: "chat", targetId, file: file() });
    await flush();
    expect(controller.getState("d1")?.status).toBe("put_failed");
    expect(createUpload).toHaveBeenCalledTimes(1);

    put.mockResolvedValueOnce({ status: 200 });
    controller.retry("d1");
    await flush();

    expect(createUpload).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: "https://media.example.com/x?sig=1" }),
    );
  });

  test("a 403 PUT response requires retryWithNewIntent, not retry", async () => {
    const { controller, createUpload, put } = setup();
    createUpload.mockResolvedValue({
      upload: { id: uploadId },
      put: { url: "https://media.example.com/x?sig=1" },
    });
    put.mockResolvedValueOnce({ status: 403 });

    controller.start({ draftId: "d1", scope: "chat", targetId, file: file() });
    await flush();
    expect(controller.getState("d1")?.status).toBe("put_expired");

    controller.retry("d1");
    await Promise.resolve();
    expect(controller.getState("d1")?.status).toBe("put_expired");
    expect(createUpload).toHaveBeenCalledTimes(1);

    createUpload.mockResolvedValueOnce({
      upload: { id: uploadId },
      put: { url: "https://media.example.com/x?sig=2" },
    });
    controller.retryWithNewIntent("d1");
    await Promise.resolve();
    expect(createUpload).toHaveBeenCalledTimes(2);
  });

  test("retry after a finalize failure re-calls finalize with the same upload id, never re-uploading", async () => {
    const { controller, createUpload, put, finalizeUpload } = setup();
    createUpload.mockResolvedValue({
      upload: { id: uploadId },
      put: { url: "https://media.example.com/x?sig=1" },
    });
    put.mockResolvedValue({ status: 200 });
    finalizeUpload.mockRejectedValueOnce(new Error("network"));

    controller.start({ draftId: "d1", scope: "chat", targetId, file: file() });
    await flush();
    expect(controller.getState("d1")?.status).toBe("finalize_failed");
    expect(put).toHaveBeenCalledTimes(1);

    finalizeUpload.mockResolvedValueOnce(finalizeResultFor(uploadId));
    controller.retry("d1");
    await flush();

    expect(put).toHaveBeenCalledTimes(1);
    expect(finalizeUpload).toHaveBeenLastCalledWith(
      "token",
      uploadId,
      expect.anything(),
      expect.anything(),
    );
    expect(controller.getState("d1")?.status).toBe("confirmed");
  });

  test("a generation change fences a result that arrives after an account/target switch", async () => {
    const { controller, createUpload, setGeneration } = setup("gen-1");
    const intent = deferred<{
      upload: { id: string };
      put: { url: string };
    }>();
    createUpload.mockReturnValue(intent.promise);

    controller.start({ draftId: "d1", scope: "chat", targetId, file: file() });
    setGeneration("gen-2");
    intent.resolve({
      upload: { id: uploadId },
      put: { url: "https://media.example.com/x?sig=1" },
    });
    await flush();

    // The stale draft is stuck at requesting_intent forever rather than
    // silently continuing into another account/target's upload.
    expect(controller.getState("d1")?.status).toBe("requesting_intent");
  });

  test("remove aborts an in-flight draft and drops late completion", async () => {
    const { controller, createUpload, put, cleanup } = setup();
    const intent = deferred<{
      upload: { id: string };
      put: { url: string };
    }>();
    createUpload.mockReturnValue(intent.promise);

    controller.start({ draftId: "d1", scope: "chat", targetId, file: file() });
    controller.remove("d1");
    expect(controller.getState("d1")).toBeNull();
    intent.resolve({
      upload: { id: uploadId },
      put: { url: "https://media.example.com/x" },
    });
    await flush();
    expect(put).not.toHaveBeenCalled();
    expect(cleanup.deleteIfExists).toHaveBeenCalledWith(file().uri);
  });

  test("dispose aborts all work; a cancelled, deleted file cannot be retried", async () => {
    const { controller, createUpload } = setup();
    createUpload.mockReturnValue(new Promise(() => undefined));
    controller.start({ draftId: "a", scope: "chat", targetId, file: file() });
    controller.cancel("a");
    controller.retry("a");
    controller.retryWithNewIntent("a");
    expect(createUpload).toHaveBeenCalledTimes(1);
    controller.dispose();
    controller.start({ draftId: "b", scope: "chat", targetId, file: file() });
    expect(createUpload).toHaveBeenCalledTimes(1);
    expect(controller.getState("a")).toBeNull();
  });

  test("rejects unsupported bytes before requesting an intent", () => {
    const { controller, createUpload } = setup();
    controller.start({
      draftId: "a",
      scope: "chat",
      targetId,
      file: { ...file(), contentType: "image/heic" },
    });
    expect(createUpload).not.toHaveBeenCalled();
    expect(controller.getState("a")).toMatchObject({
      status: "intent_failed",
      error: { status: 422 },
    });
  });
});
