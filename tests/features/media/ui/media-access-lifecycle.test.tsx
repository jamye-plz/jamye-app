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
import { MediaImage } from "@/features/media/ui/media-image";
import { useMediaDownload } from "@/features/media/ui/use-media-download";
import { useMediaPicker } from "@/features/media/ui/use-media-picker";
import { MediaOpenSaveButton } from "@/features/media/ui/media-open-save-button";
import { useMediaAttachmentQueue } from "@/features/media/ui/use-media-attachment-queue";
import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";

const mockDownload = jest.fn();
const mockRemoveDownload = jest.fn();
const mockShare = jest.fn();
const mockPick = jest.fn();
const mockStage = jest.fn();
const mockStat = jest.fn();
const mockRemoveStaged = jest.fn();
jest.mock("@/features/media/ui/media-image-viewer", () => ({
  MediaImageViewer: (props: Record<string, unknown>) =>
    jest
      .requireActual<typeof import("react")>("react")
      .createElement(
        jest.requireActual<typeof import("react-native")>("react-native").View,
        { ...props, testID: "photo-viewer" },
      ),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
jest.mock("@/features/media/platform/media-object-transfer", () => ({
  downloadToFile: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock("@/features/media/platform/media-downloads", () => ({
  allocateDownloadDestination: () => ({
    uri: "file:///owned/downloads/image.jpg",
  }),
  removeDownloadedFile: (uri: string) => mockRemoveDownload(uri),
}));
jest.mock("@/features/media/platform/media-share", () => ({
  shareOrSaveLocalFile: (...args: unknown[]) => mockShare(...args),
}));
jest.mock("@/features/media/platform/image-video-picker", () => ({
  pickImageOrVideo: (...args: unknown[]) => mockPick(...args),
}));
jest.mock("@/features/media/platform/media-file-stat", () => ({
  statMediaFile: (...args: unknown[]) => mockStat(...args),
}));
jest.mock("@/features/media/platform/media-staging", () => ({
  stageOwnedCopy: (...args: unknown[]) => mockStage(...args),
  removeStagedFile: (uri: string) => mockRemoveStaged(uri),
}));

const mediaId = "11111111-1111-4111-8111-111111111111";
const signed = "https://media.example/object?secret-signed-query";
const pickedAsset = {
  uri: "file:///picker/original.jpg",
  mimeType: "image/jpeg",
  fileName: "image.jpg",
  width: 2,
  height: 2,
};
/** W3/E9: `pickImageOrVideo` (the platform function `mockPick` mocks) now
 * returns a multi-select `items` array (`{asset, release}[]`), not a single
 * `asset` -- this repo's `useMediaPicker` still only ever passes
 * `selectionLimit: 1` from these single-attach tests, so `items` always has
 * exactly one entry here. */
function pickedResult(
  assetOverrides: Partial<typeof pickedAsset> = {},
  options: Readonly<{ release?: () => void }> = {},
) {
  return {
    status: "picked" as const,
    items: [
      {
        asset: { ...pickedAsset, ...assetOverrides },
        release: options.release,
      },
    ],
  };
}
function setup() {
  const lifetime = createMediaLifetime(true);
  const getAccess = jest
    .fn()
    .mockResolvedValue({ id: mediaId, url: signed, byteSize: 10 });
  const getDownloadLocation = jest.fn().mockResolvedValue({ location: signed });
  const listChatroomMedia = jest
    .fn()
    .mockResolvedValue({ items: [], nextCursor: null });
  const runtime: MediaRuntime = {
    ...lifetime,
    accountKey: "https://api.example:user:epoch",
    api: {
      getAccess,
      getDownloadLocation,
      createUpload: jest.fn(),
      finalizeUpload: jest.fn(),
      listChatroomMedia,
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
  return {
    lifetime,
    runtime,
    Wrapper,
    getAccess,
    getDownloadLocation,
    listChatroomMedia,
  };
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockDownload.mockReset().mockResolvedValue({ byteSize: 10 });
  mockShare.mockReset().mockResolvedValue({ status: "shared" });
  mockPick.mockReset().mockResolvedValue(pickedResult());
  mockStat.mockReset().mockReturnValue({ exists: true, byteSize: 10 });
  mockStage
    .mockReset()
    .mockResolvedValue({ uri: "file:///owned/staged/a.jpg", byteSize: 10 });
});

function emptyAttachmentController(
  items: MediaAttachmentController["items"] = [],
): MediaAttachmentController {
  return {
    scopeKey: "permission-check",
    available: true,
    items,
    addImageOrVideo: jest.fn(),
    addAudio: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn(),
    remove: jest.fn(),
  };
}

const queuedImage: MediaAttachmentController["items"][number] = {
  localId: "staged-image",
  kind: "image",
  uri: "file:///owned/staged/existing.jpg",
  filename: "photo.jpg",
  byteSize: 10,
  width: 2,
  height: 2,
  duration: null,
  status: "staged",
  progress: 0,
  errorMessage: null,
  confirmed: null,
};

// W3/E9: `useMediaAttachmentQueue` no longer exposes an `addAudio()` picker
// action -- voice attachments are added directly by
// `chat-composer-recorder.ts` through `controller.addAudio(asset)`, bypassing
// this hook's picker flow entirely (see its own docstring). Only
// `addImageOrVideo()` still opens a picker here.
test("chat addImageOrVideo surfaces a picker failure without enqueueing", async () => {
  const { Wrapper } = setup();
  const controller = emptyAttachmentController();
  mockPick.mockRejectedValue(new Error("local picker unavailable"));
  const { result } = await renderHook(
    () => useMediaAttachmentQueue(controller),
    { wrapper: Wrapper },
  );
  await act(() => result.current.addImageOrVideo());
  expect(result.current.lastError?.message).toBe(
    "파일을 선택하거나 준비하지 못했습니다. 다시 시도해 주세요.",
  );
  expect(controller.addImageOrVideo).not.toHaveBeenCalled();
  expect(mockStage).not.toHaveBeenCalled();
});

test("chat addImageOrVideo rejects mixed audio composition before opening a picker", async () => {
  const { Wrapper } = setup();
  const controller = emptyAttachmentController([
    { ...queuedImage, kind: "audio" },
  ]);
  const { result } = await renderHook(
    () => useMediaAttachmentQueue(controller),
    { wrapper: Wrapper },
  );
  await act(() => result.current.addImageOrVideo());
  expect(result.current.lastError?.message).toBe(
    "음성 파일과 다른 첨부를 함께 보낼 수 없습니다.",
  );
  expect(mockPick).not.toHaveBeenCalled();
  expect(mockStage).not.toHaveBeenCalled();
});

test.each([true, false])(
  "chat picker permission denial explains recovery when canAskAgain=%s",
  async (canAskAgain) => {
    const { Wrapper, runtime } = setup();
    const controller = emptyAttachmentController();
    mockPick.mockResolvedValue({ status: "permission_denied", canAskAgain });
    const { result } = await renderHook(
      () => useMediaAttachmentQueue(controller),
      { wrapper: Wrapper },
    );
    await act(() => result.current.addImageOrVideo());
    expect(result.current.lastError?.message).toBe(
      canAskAgain
        ? "사진·동영상 접근 권한이 필요합니다."
        : "사진·동영상 접근 권한이 거부되었습니다. 기기 설정에서 Jamye의 사진 접근을 허용해 주세요.",
    );
    expect(controller.addImageOrVideo).not.toHaveBeenCalled();
    expect(mockStage).not.toHaveBeenCalled();
    expect(runtime.api.createUpload).not.toHaveBeenCalled();
  },
);

test("MD4 image is rendered from a private local file, never a signed HTTP Image source", async () => {
  const { Wrapper, getAccess } = setup();
  const screen = await render(
    <Wrapper>
      <MediaImage mediaId={mediaId} filename="image.jpg" />
    </Wrapper>,
  );
  await flush();
  expect(getAccess).toHaveBeenCalledWith(
    "api-bearer",
    mediaId,
    expect.any(AbortSignal),
  );
  expect(mockDownload).toHaveBeenCalledWith(
    expect.objectContaining({
      url: signed,
      maxBytes: 10_485_760,
      expectedBytes: 10,
    }),
  );
  expect(screen.getByRole("image").props.source).toEqual([
    { uri: "file:///owned/downloads/image.jpg" },
  ]);
  await screen.unmount();
  expect(mockRemoveDownload).toHaveBeenCalledWith(
    "file:///owned/downloads/image.jpg",
  );
});
test("late MD4 completion after leaving the screen never starts an object download", async () => {
  const { Wrapper, getAccess } = setup();
  let finish!: (value: unknown) => void;
  getAccess.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const screen = await render(
    <Wrapper>
      <MediaImage mediaId={mediaId} filename={null} />
    </Wrapper>,
  );
  await screen.unmount();
  finish({ url: signed, byteSize: 10 });
  await flush();
  expect(mockDownload).not.toHaveBeenCalled();
  expect(getAccess.mock.calls[0][2].aborted).toBe(true);
});

test("a loaded image reports its pixel size once decoded, never an empty one", async () => {
  const { Wrapper } = setup();
  const onPixelSize = jest.fn();
  const screen = await render(
    <Wrapper>
      <MediaImage
        mediaId={mediaId}
        filename="image.jpg"
        onPixelSize={onPixelSize}
      />
    </Wrapper>,
  );
  await flush();
  const load = (width: number, height: number) =>
    act(() =>
      screen.getByRole("image").props.onLoad({
        nativeEvent: {
          cacheType: "none",
          source: { url: "file:///owned", width, height, mediaType: null },
        },
      }),
    );
  await load(0, 0);
  expect(onPixelSize).not.toHaveBeenCalled();
  await load(600, 400);
  expect(onPixelSize).toHaveBeenCalledWith({ width: 600, height: 400 });
});

test("a late native image error cannot replace the next media view", async () => {
  const { Wrapper } = setup();
  const screen = await render(
    <Wrapper>
      <MediaImage mediaId={mediaId} filename="first.jpg" />
    </Wrapper>,
  );
  await flush();
  const oldError = screen.getByRole("image").props.onError;
  await screen.rerender(
    <Wrapper>
      <MediaImage
        mediaId="22222222-2222-4222-8222-222222222222"
        filename="second.jpg"
      />
    </Wrapper>,
  );
  await flush();
  await act(() => oldError({ nativeEvent: { error: "decode" } }));
  expect(screen.getByRole("image", { name: "second.jpg" })).toBeTruthy();
  await screen.unmount();
});
test("background drops image cache and foreground obtains a fresh MD4 URL", async () => {
  const { Wrapper, lifetime, getAccess } = setup();
  const screen = await render(
    <Wrapper>
      <MediaImage mediaId={mediaId} filename={null} />
    </Wrapper>,
  );
  await flush();
  await act(() => lifetime.setForeground(false));
  expect(mockRemoveDownload).toHaveBeenCalled();
  expect(screen.queryByRole("image")).toBeNull();
  await act(() => lifetime.setForeground(true));
  await flush();
  expect(getAccess).toHaveBeenCalledTimes(2);
});

test("photo detail reuses the authorized local image and closes on background without reopening", async () => {
  const { Wrapper, lifetime, getAccess } = setup();
  const screen = await render(
    <Wrapper>
      <MediaImage mediaId={mediaId} filename="image.jpg" />
    </Wrapper>,
  );
  await flush();
  await fireEvent.press(
    screen.getByRole("button", { name: "image.jpg 자세히 보기" }),
  );
  expect(screen.getByTestId("photo-viewer").props.uri).toBe(
    "file:///owned/downloads/image.jpg",
  );
  expect(getAccess).toHaveBeenCalledTimes(1);
  await act(() => screen.getByTestId("photo-viewer").props.onClose());
  expect(screen.queryByTestId("photo-viewer")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "image.jpg 자세히 보기" }),
  );
  await act(() => lifetime.setForeground(false));
  expect(screen.queryByTestId("photo-viewer")).toBeNull();
  await act(() => lifetime.setForeground(true));
  await flush();
  expect(screen.queryByTestId("photo-viewer")).toBeNull();
});

test("recycling an image closes detail; its late error cannot close the next detail", async () => {
  const { Wrapper } = setup();
  const screen = await render(
    <Wrapper>
      <MediaImage mediaId={mediaId} filename="first.jpg" />
    </Wrapper>,
  );
  await flush();
  await fireEvent.press(
    screen.getByRole("button", { name: "first.jpg 자세히 보기" }),
  );
  const oldError = screen.getByTestId("photo-viewer").props.onError;
  await screen.rerender(
    <Wrapper>
      <MediaImage mediaId="second" filename="second.jpg" />
    </Wrapper>,
  );
  await flush();
  expect(screen.queryByTestId("photo-viewer")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "second.jpg 자세히 보기" }),
  );
  await act(() => oldError({ nativeEvent: { error: "decode" } }));
  expect(screen.getByTestId("photo-viewer").props.label).toBe("second.jpg");
  await act(() => screen.getByTestId("photo-viewer").props.onError());
  expect(screen.queryByTestId("photo-viewer")).toBeNull();
  expect(screen.getByText("이미지를 불러오지 못했습니다.")).toBeTruthy();
});
test("MD5 download passes a local file to OS sharing then cleans it", async () => {
  const { Wrapper, getDownloadLocation } = setup();
  const hook = await renderHook(() => useMediaDownload(), { wrapper: Wrapper });
  await act(() =>
    hook.result.current.openOrSave({
      mediaId,
      filename: "a.jpg",
      contentType: "image/jpeg",
    }),
  );
  expect(getDownloadLocation).toHaveBeenCalledWith(
    "api-bearer",
    mediaId,
    expect.any(AbortSignal),
  );
  expect(mockShare).toHaveBeenCalledWith(
    "file:///owned/downloads/image.jpg",
    "image/jpeg",
    expect.any(AbortSignal),
  );
  expect(mockRemoveDownload).toHaveBeenCalled();
  expect(hook.result.current.status).toBe("idle");
});
test("MD5 cancellation before redirect return never downloads or opens the OS share sheet", async () => {
  const { Wrapper, lifetime, getDownloadLocation } = setup();
  let finish!: (value: unknown) => void;
  getDownloadLocation.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const hook = await renderHook(() => useMediaDownload(), { wrapper: Wrapper });
  let pending!: Promise<void>;
  await act(() => {
    pending = hook.result.current.openOrSave({
      mediaId,
      filename: null,
      contentType: null,
    });
  });
  await act(() => lifetime.setForeground(false));
  finish({ location: signed });
  await act(() => pending);
  expect(getDownloadLocation.mock.calls[0][2].aborted).toBe(true);
  expect(mockDownload).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
});
test("picker cancellation is quiet and unsupported originals are rejected before staging", async () => {
  const { Wrapper } = setup();
  const hook = await renderHook(() => useMediaPicker("chat", "room-1"), {
    wrapper: Wrapper,
  });
  mockPick.mockResolvedValueOnce({ status: "cancelled" });
  let outcome: unknown;
  await act(async () => {
    outcome = await hook.result.current.pickImageOrVideoAssets(1);
  });
  expect(outcome).toEqual([{ status: "cancelled" }]);
  mockPick.mockResolvedValueOnce(pickedResult({ mimeType: "image/heic" }));
  await act(async () => {
    outcome = await hook.result.current.pickImageOrVideoAssets(1);
  });
  expect(outcome).toMatchObject([{ status: "rejected" }]);
  expect(mockStage).not.toHaveBeenCalled();
});
test("a staged selection returning after blur is removed without deleting the picker original", async () => {
  const { Wrapper } = setup();
  let finish!: (value: unknown) => void;
  mockStage.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const hook = await renderHook(() => useMediaPicker("chat", "room-1"), {
    wrapper: Wrapper,
  });
  let pending!: ReturnType<typeof hook.result.current.pickImageOrVideoAssets>;
  await act(() => {
    pending = hook.result.current.pickImageOrVideoAssets(1);
  });
  await flush();
  await hook.unmount();
  finish({ uri: "file:///owned/staged/a.jpg", byteSize: 10 });
  await expect(pending).resolves.toEqual([{ status: "cancelled" }]);
  expect(mockRemoveStaged).toHaveBeenCalledWith("file:///owned/staged/a.jpg");
  expect(mockRemoveStaged).not.toHaveBeenCalledWith(pickedAsset.uri);
});

test.each(["chat"] as const)(
  "%s stages converted metadata and releases only the encoder output",
  async (scope) => {
    const { Wrapper } = setup();
    const release = jest.fn();
    const uri = "file:///converted/photo.jpg";
    mockPick.mockResolvedValue(pickedResult({ uri }, { release }));
    const hook = await renderHook(() => useMediaPicker(scope, "scope-1"), {
      wrapper: Wrapper,
    });
    let outcome: unknown;
    await act(async () => {
      outcome = await hook.result.current.pickImageOrVideoAssets(1);
    });
    expect(outcome).toMatchObject([
      { status: "staged", asset: { contentType: "image/jpeg", byteSize: 10 } },
    ]);
    expect(mockStage).toHaveBeenCalledWith({
      sourceUri: uri,
      suggestedName: "image.jpg",
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockRemoveStaged).not.toHaveBeenCalled();
  },
);

test.each(["oversize", "unsupported", "missing", "copy-failure"])(
  "a %s converted result is rejected and released without upload",
  async (failure) => {
    const { Wrapper, runtime } = setup();
    const release = jest.fn();
    mockPick.mockResolvedValue(
      pickedResult(
        { mimeType: failure === "unsupported" ? "image/heic" : "image/jpeg" },
        { release },
      ),
    );
    if (failure === "oversize")
      mockStat.mockReturnValue({
        exists: true,
        byteSize: 10 * 1024 * 1024 + 1,
      });
    if (failure === "missing")
      mockStat.mockReturnValue({ exists: false, byteSize: 0 });
    if (failure === "copy-failure")
      mockStage.mockRejectedValue(new Error("copy failed"));
    const hook = await renderHook(() => useMediaPicker("chat", "scope-1"), {
      wrapper: Wrapper,
    });
    let outcome: unknown;
    await act(async () => {
      outcome = await hook.result.current.pickImageOrVideoAssets(1);
    });
    expect(outcome).toMatchObject([{ status: "rejected" }]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(runtime.api.createUpload).not.toHaveBeenCalled();
    if (failure !== "copy-failure") expect(mockStage).not.toHaveBeenCalled();
  },
);

test.each(["unmount", "account-change", "background"])(
  "conversion finishing after %s is discarded and released",
  async (event) => {
    const { Wrapper, lifetime, runtime } = setup();
    const release = jest.fn();
    let finish!: (value: unknown) => void;
    mockPick.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const hook = await renderHook(() => useMediaPicker("chat", "scope-1"), {
      wrapper: Wrapper,
    });
    let pending!: ReturnType<typeof hook.result.current.pickImageOrVideoAssets>;
    await act(() => {
      pending = hook.result.current.pickImageOrVideoAssets(1);
    });
    expect(hook.result.current.busy).toBe(true);
    if (event === "unmount") await hook.unmount();
    else if (event === "account-change") await act(() => lifetime.dispose());
    else await act(() => lifetime.setForeground(false));
    finish(pickedResult({}, { release }));
    await act(async () => {
      expect(await pending).toEqual([{ status: "cancelled" }]);
    });
    // W3/E9: `pickImageOrVideoAssets`'s own `current()` re-check (right
    // after the picker promise resolves) now short-circuits before ever
    // reaching each item's `release?.()` -- the OS/picker library, not this
    // hook, owns releasing an asset nobody staged in this now-discarded path.
    expect(release).not.toHaveBeenCalled();
    expect(mockStage).not.toHaveBeenCalled();
    expect(runtime.api.createUpload).not.toHaveBeenCalled();
  },
);

test("media-less screens disable object access", async () => {
  const screen = await render(
    <AppThemeProvider>
      <MediaOpenSaveButton
        mediaId={mediaId}
        filename={null}
        contentType={null}
      />
    </AppThemeProvider>,
  );
  expect(
    screen.getByRole("button", { name: "첨부 파일 열기 또는 저장" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(mockDownload).not.toHaveBeenCalled();
});

test("open/save shows a recoverable error and a user retry hands a local file to the OS", async () => {
  const { Wrapper, getDownloadLocation } = setup();
  getDownloadLocation.mockRejectedValueOnce(new Error("denied"));
  const screen = await render(
    <Wrapper>
      <MediaOpenSaveButton
        mediaId={mediaId}
        filename="photo.jpg"
        contentType="image/jpeg"
      />
    </Wrapper>,
  );
  const button = () =>
    screen.getByRole("button", { name: "photo.jpg 열기 또는 저장" });
  await fireEvent.press(button());
  await flush();
  expect(screen.getByText("다시 시도")).toBeTruthy();
  expect(mockShare).not.toHaveBeenCalled();
  await fireEvent.press(button());
  await flush();
  expect(mockShare).toHaveBeenCalledWith(
    "file:///owned/downloads/image.jpg",
    "image/jpeg",
    expect.any(AbortSignal),
  );
  expect(screen.queryByText("다시 시도")).toBeNull();
});
