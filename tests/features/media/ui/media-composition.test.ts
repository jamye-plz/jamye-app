import {
  canAddAudio,
  canAddImageOrVideo,
  isSendableWithoutBody,
} from "@/features/media/ui/media-composition";
import type { MediaAttachmentQueueItem } from "@/features/media/ui/media-attachment-types";

function item(
  overrides: Partial<MediaAttachmentQueueItem> = {},
): MediaAttachmentQueueItem {
  return {
    localId: "local-1",
    kind: "image",
    filename: "a.jpg",
    byteSize: 10,
    width: null,
    height: null,
    duration: null,
    status: "confirmed",
    progress: 0,
    errorMessage: null,
    confirmed: null,
    ...overrides,
  };
}

describe("M11 client-side C4 composition guard", () => {
  test("allows up to four ordered non-audio attachments, then blocks a fifth", () => {
    const four = [1, 2, 3, 4].map((n) => item({ localId: `local-${n}` }));
    expect(canAddImageOrVideo(four)).toEqual(
      expect.objectContaining({ allowed: false }),
    );
    expect(canAddImageOrVideo(four.slice(0, 3))).toEqual({ allowed: true });
  });

  test("blocks adding an image/video once an audio attachment is queued", () => {
    expect(canAddImageOrVideo([item({ kind: "audio" })])).toEqual(
      expect.objectContaining({ allowed: false }),
    );
  });

  test("blocks adding audio when any other attachment already exists", () => {
    expect(canAddAudio([item()])).toEqual(
      expect.objectContaining({ allowed: false }),
    );
    expect(canAddAudio([])).toEqual({ allowed: true });
  });

  test("cancelled items do not count against the composition limits", () => {
    const cancelled = [1, 2, 3, 4].map((n) =>
      item({ localId: `local-${n}`, status: "cancelled" }),
    );
    expect(canAddImageOrVideo(cancelled)).toEqual({ allowed: true });
  });

  test("a bodyless send is offered only once every active item is confirmed", () => {
    expect(isSendableWithoutBody([item({ status: "uploading" })])).toBe(false);
    expect(isSendableWithoutBody([item({ status: "confirmed" })])).toBe(true);
    expect(isSendableWithoutBody([])).toBe(false);
  });
});
