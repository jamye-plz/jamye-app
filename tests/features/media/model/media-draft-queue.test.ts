import React from "react";
import { act, render } from "@testing-library/react-native";
import {
  createMediaDraftQueue,
  useMediaUploadQueue,
} from "@/features/media/model/use-media-upload-queue";
import {
  MediaRuntimeProvider,
  type MediaRuntime,
} from "@/features/media/model/media-runtime";
import type { StagedMediaAsset } from "@/features/media/ui/media-attachment-types";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
const targetId = "88888888-8888-4888-8888-888888888888";
const asset: StagedMediaAsset = {
  localId: "a",
  kind: "image",
  scope: "chat",
  uri: "file:///owned/a.jpg",
  contentType: "image/jpeg",
  byteSize: 100,
  filename: "a.jpg",
  width: 20,
  height: 20,
  durationSeconds: null,
};
const finalized = {
  scope: "chat" as const,
  bound: false as const,
  upload: {
    id: "77777777-7777-4777-8777-777777777777",
    scope: "chat" as const,
    targetId,
    kind: "image" as const,
    contentType: "image/jpeg",
    byteSize: 100,
    filename: "a.jpg",
    duration: null,
    confirmedAt: "2026-09-11T00:00:00Z",
  },
};
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
function setup() {
  const createUpload = jest.fn().mockResolvedValue({
    upload: { id: finalized.upload.id },
    put: { url: "https://media.example.com/x" },
  });
  const finalizeUpload = jest.fn().mockResolvedValue(finalized);
  const put = jest.fn().mockResolvedValue({ status: 200 });
  const remove = jest.fn().mockResolvedValue(undefined);
  const runtime: MediaRuntime = {
    api: {
      createUpload,
      finalizeUpload,
      listTopicMedia: jest.fn(),
      getAccess: jest.fn(),
      getDownloadLocation: jest.fn(),
    },
    authorize: (execute, signal) =>
      execute("fresh-session-token", signal ?? new AbortController().signal),
    objectPut: { put },
    cleanup: { deleteIfExists: remove },
    accountKey: "account-1",
    captureGeneration: () => 1,
    isCurrent: () => true,
    subscribeInvalidation: () => () => undefined,
  };
  const queue = createMediaDraftQueue(runtime, "chat", targetId);
  queue.configure(true);
  queue.setActive(true);
  return { queue, runtime, createUpload, finalizeUpload, put, remove };
}

test("a mounted draft queue survives effect replay and cancels without reviving a stale screen", async () => {
  const { runtime, createUpload, put, finalizeUpload } = setup();
  let current!: ReturnType<typeof useMediaUploadQueue>;
  const effectSetup = jest.fn();
  function Probe() {
    const queue = useMediaUploadQueue("chat", targetId, true);
    React.useLayoutEffect(() => {
      current = queue;
    }, [queue]);
    React.useEffect(() => {
      effectSetup();
    }, []);
    return null;
  }
  const view = await render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(
        MediaRuntimeProvider,
        { value: runtime },
        React.createElement(Probe),
      ),
    ),
  );
  expect(effectSetup).toHaveBeenCalledTimes(2);
  await act(async () => {
    current.addImageOrVideo(asset);
    await flush();
  });
  expect(createUpload).toHaveBeenCalledTimes(1);
  expect(current.items[0]?.status).toBe("confirmed");

  put.mockReturnValue(new Promise(() => {}));
  await act(async () => {
    current.addImageOrVideo({ ...asset, localId: "pending" });
    await flush();
  });
  const signal = put.mock.calls[1][0].signal as AbortSignal;
  const stale = current;
  await view.unmount();
  expect(signal.aborted).toBe(true);
  expect(stale.getSnapshot()).toEqual([]);
  stale.addImageOrVideo({ ...asset, localId: "after-unmount" });
  await flush();
  expect(createUpload).toHaveBeenCalledTimes(2);
  expect(finalizeUpload).toHaveBeenCalledTimes(1);
});
test("confirms ordered references for the existing outbox without retaining URI or signed URL", async () => {
  const { queue, createUpload } = setup();
  queue.addImageOrVideo(asset);
  await flush();
  expect(createUpload.mock.calls[0][0]).toBe("fresh-session-token");
  expect(queue.getSnapshot()[0]).toMatchObject({
    status: "confirmed",
    confirmed: { mediaUploadId: finalized.upload.id, type: "image/jpeg" },
  });
  expect(JSON.stringify(queue.getSnapshot())).not.toContain("file://");
  expect(JSON.stringify(queue.getSnapshot())).not.toContain("https://");
  queue.clear();
  expect(queue.getSnapshot()).toEqual([]);
});
test("blur drops a late PUT result and never finalizes in another scope", async () => {
  const { queue, put, finalizeUpload, remove } = setup();
  let resolve!: (value: { status: number }) => void;
  put.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  queue.addImageOrVideo(asset);
  await flush();
  const signal = put.mock.calls[0][0].signal as AbortSignal;
  queue.setActive(false);
  resolve({ status: 200 });
  await flush();
  expect(signal.aborted).toBe(true);
  expect(finalizeUpload).not.toHaveBeenCalled();
  expect(queue.getSnapshot()).toEqual([]);
  expect(remove).toHaveBeenCalledWith(asset.uri);
});
test("removal/revocation and composition guard prevent orphan drafts or a second audio upload", async () => {
  const { queue, createUpload, remove } = setup();
  queue.addImageOrVideo(asset);
  await flush();
  queue.addAudio({
    ...asset,
    localId: "audio",
    kind: "audio",
    contentType: "audio/ogg",
  });
  expect(createUpload).toHaveBeenCalledTimes(1);
  queue.configure(false);
  queue.addImageOrVideo({ ...asset, localId: "later" });
  expect(createUpload).toHaveBeenCalledTimes(1);
  expect(queue.getSnapshot()).toEqual([]);
  expect(remove).toHaveBeenCalled();
});

test("reconfiguring a disabled empty queue preserves its snapshot without a render notification", () => {
  const queue = createMediaDraftQueue(null, "topic", targetId);
  const initial = queue.getSnapshot();
  const listener = jest.fn();
  queue.subscribe(listener);
  queue.configure(false, () => undefined);
  queue.configure(false, () => undefined);
  queue.setActive(false);
  queue.clear();
  expect(queue.getSnapshot()).toBe(initial);
  expect(listener).not.toHaveBeenCalled();
});
