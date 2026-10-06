import { act, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { AttachmentQueueList } from "@/features/media/ui/attachment-queue-list";
import type { MediaAttachmentQueueItem } from "@/features/media/ui/media-attachment-types";

const mockCreateNativeVideoThumbnail = jest.fn();
const mockRemoveStagedFile = jest.fn();
jest.mock("@/features/media/platform/native-video-thumbnail", () => ({
  createNativeVideoThumbnail: (...args: unknown[]) =>
    mockCreateNativeVideoThumbnail(...args),
}));
jest.mock("@/features/media/platform/media-staging", () => ({
  removeStagedFile: (...args: unknown[]) => mockRemoveStagedFile(...args),
}));

function videoItem(
  overrides: Partial<MediaAttachmentQueueItem> = {},
): MediaAttachmentQueueItem {
  return {
    localId: "video-a",
    kind: "video",
    uri: "file:///staged/clip.mov",
    filename: "clip.mov",
    byteSize: 100,
    width: null,
    height: null,
    duration: 3,
    status: "staged",
    progress: 0,
    errorMessage: null,
    confirmed: null,
    ...overrides,
  };
}

const noop = () => undefined;

describe("AttachmentQueueList draft thumbnails (W4)", () => {
  beforeEach(() => {
    mockCreateNativeVideoThumbnail.mockReset();
    mockRemoveStagedFile.mockReset();
  });

  test("a video draft shows the play mark immediately, then swaps in the generated first-frame thumbnail once ready", async () => {
    let resolveThumbnail!: (uri: string) => void;
    mockCreateNativeVideoThumbnail.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveThumbnail = resolve;
      }),
    );
    const screen = await render(
      <AppThemeProvider>
        <AttachmentQueueList
          items={[videoItem()]}
          onCancel={noop}
          onRemove={noop}
          onRetry={noop}
        />
      </AppThemeProvider>,
    );

    expect(mockCreateNativeVideoThumbnail).toHaveBeenCalledWith(
      "file:///staged/clip.mov",
      expect.any(AbortSignal),
      expect.objectContaining({ destination: "staging" }),
    );
    // Before the thumbnail resolves, only the placeholder background + play
    // mark render -- no expo-image thumbnail source yet.
    expect(screen.queryByTestId("draft-video-thumbnail-image")).toBeNull();

    await act(async () => {
      resolveThumbnail("file:///staged/thumbnail.jpg");
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("draft-video-thumbnail-image").props.source,
      ).toEqual([{ uri: "file:///staged/thumbnail.jpg" }]),
    );
  });

  test("a failed thumbnail generation leaves the placeholder + play mark in place (no crash)", async () => {
    mockCreateNativeVideoThumbnail.mockRejectedValue(
      new Error("thumbnail_unavailable:generate:native_unavailable"),
    );
    const screen = await render(
      <AppThemeProvider>
        <AttachmentQueueList
          items={[videoItem({ localId: "video-b" })]}
          onCancel={noop}
          onRemove={noop}
          onRetry={noop}
        />
      </AppThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve().then(() => Promise.resolve());
    });
    expect(screen.queryByTestId("draft-video-thumbnail-image")).toBeNull();
  });

  test("unmounting before generation resolves aborts the signal and cleans up the staged thumbnail file", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveThumbnail!: (uri: string) => void;
    mockCreateNativeVideoThumbnail.mockImplementation(
      (_uri: string, signal: AbortSignal) => {
        capturedSignal = signal;
        return new Promise<string>((resolve) => {
          resolveThumbnail = resolve;
        });
      },
    );
    const screen = await render(
      <AppThemeProvider>
        <AttachmentQueueList
          items={[videoItem({ localId: "video-c" })]}
          onCancel={noop}
          onRemove={noop}
          onRetry={noop}
        />
      </AppThemeProvider>,
    );
    await act(async () => {
      screen.unmount();
    });
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      resolveThumbnail("file:///staged/late-thumbnail.jpg");
    });
    expect(mockRemoveStagedFile).toHaveBeenCalledWith(
      "file:///staged/late-thumbnail.jpg",
    );
  });
});

describe("AttachmentQueueList accessibility (A11YF-AC5)", () => {
  beforeEach(() => {
    mockCreateNativeVideoThumbnail.mockReset();
    mockRemoveStagedFile.mockReset();
  });

  test("the remove ('빼기') button reaches the 44x44 minimum touch target (currently 20pt + 8pt hitSlop = 36pt)", async () => {
    // An image attachment (not video) renders synchronously -- no
    // `createNativeVideoThumbnail` promise to await -- since this test only
    // checks the remove button's touch target, not thumbnail generation.
    const screen = await render(
      <AppThemeProvider>
        <AttachmentQueueList
          items={[
            videoItem({
              kind: "image",
              filename: "photo.jpg",
              uri: "file:///staged/photo.jpg",
            }),
          ]}
          onCancel={noop}
          onRemove={noop}
          onRetry={noop}
        />
      </AppThemeProvider>,
    );
    const removeButton = screen.getByLabelText("photo.jpg 빼기");
    const style = StyleSheet.flatten(removeButton.props.style) ?? {};
    const rawHitSlop = removeButton.props.hitSlop;
    const hitSlop =
      typeof rawHitSlop === "number"
        ? {
            top: rawHitSlop,
            bottom: rawHitSlop,
            left: rawHitSlop,
            right: rawHitSlop,
          }
        : (rawHitSlop ?? {});
    const touchHeight =
      Number(style.height ?? 0) +
      (Number(hitSlop.top) || 0) +
      (Number(hitSlop.bottom) || 0);
    const touchWidth =
      Number(style.width ?? 0) +
      (Number(hitSlop.left) || 0) +
      (Number(hitSlop.right) || 0);
    expect(touchHeight).toBeGreaterThanOrEqual(44);
    expect(touchWidth).toBeGreaterThanOrEqual(44);
  });
});
