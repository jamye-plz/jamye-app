import {
  mapConfirmedUpload,
  mapMediaAccessUrl,
  mapTopicMediaEntry,
  mapTopicMediaEntryPage,
  mapUploadFinalizeResult,
  mapUploadIntentWithPresignedPut,
} from "@/core/contracts/server/media";
import {
  chatUploadFinalizeResultWire,
  confirmedUploadWire,
  mediaAccessUrlWire,
  mediaId,
  posterUploadId,
  topicId,
  topicMediaPageWire,
  topicMediaWire,
  topicUploadFinalizeResultWire,
  uploadId,
  uploadIntentWithPresignedPutWire,
} from "./media-fixtures";

describe("M11-1 media contract mapping", () => {
  test("maps the MD1 intent + presigned PUT without object_key", () => {
    const value = mapUploadIntentWithPresignedPut(
      uploadIntentWithPresignedPutWire,
    );
    expect(value).toEqual({
      upload: {
        id: uploadId,
        scope: "chat",
        targetId: uploadIntentWithPresignedPutWire.upload.target_id,
        kind: "image",
        contentType: "image/jpeg",
        byteSize: 12345,
        filename: "photo.jpg",
        expiresAt: "2026-09-11T00:00:00Z",
        createdAt: "2026-09-10T23:00:00Z",
      },
      put: { url: uploadIntentWithPresignedPutWire.put.url, expiresIn: 3600 },
    });
    expect(value.upload).not.toHaveProperty("objectKey");
    expect(value.upload).not.toHaveProperty("object_key");
  });

  test("maps MD2's confirmed upload without object_key", () => {
    const value = mapConfirmedUpload(confirmedUploadWire);
    expect(value).toEqual({
      id: uploadId,
      scope: "chat",
      targetId: confirmedUploadWire.target_id,
      kind: "image",
      contentType: "image/jpeg",
      byteSize: 12345,
      duration: null,
      filename: "photo.jpg",
      confirmedAt: "2026-09-10T23:00:05Z",
      posterUploadId: null,
    });
  });

  test("passes a bound poster_upload_id through as posterUploadId verbatim", () => {
    const value = mapConfirmedUpload({
      ...confirmedUploadWire,
      poster_upload_id: posterUploadId,
    });
    expect(value.posterUploadId).toBe(posterUploadId);
  });

  test("MD2 chat finalize maps to the unbound branch", () => {
    const value = mapUploadFinalizeResult(chatUploadFinalizeResultWire);
    expect(value).toEqual({
      scope: "chat",
      bound: false,
      upload: mapConfirmedUpload(confirmedUploadWire),
    });
  });

  test("MD2 topic finalize maps to the bound branch with topic_media", () => {
    const value = mapUploadFinalizeResult(topicUploadFinalizeResultWire);
    expect(value).toEqual({
      scope: "topic",
      bound: true,
      topicStatus: "enriched",
      topicMedia: mapTopicMediaEntry(topicMediaWire),
      upload: mapConfirmedUpload(topicUploadFinalizeResultWire.upload),
    });
  });

  test("maps MD3's topic media page and preserves the opaque cursor", () => {
    const value = mapTopicMediaEntryPage(topicMediaPageWire);
    expect(value).toEqual({
      items: [
        {
          id: mediaId,
          topicId,
          mediaUploadId: uploadId,
          contentType: "image/jpeg",
          width: 800,
          height: 600,
          byteSize: 12345,
          createdAt: "2026-09-10T23:00:05Z",
        },
      ],
      nextCursor: null,
    });
  });

  test("maps MD4's ephemeral access url verbatim", () => {
    const value = mapMediaAccessUrl(mediaAccessUrlWire);
    expect(value.url).toBe(mediaAccessUrlWire.url);
    expect(value).toEqual({
      id: mediaId,
      mediaUploadId: uploadId,
      url: mediaAccessUrlWire.url,
      contentType: "image/jpeg",
      byteSize: 12345,
      width: 800,
      height: 600,
      duration: null,
      filename: "photo.jpg",
      expiresIn: 600,
    });
  });
});
