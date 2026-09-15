import { toPendingAttachmentDraft } from "@/features/media/model/media-attachment";
import {
  chatUploadFinalizeResultWire,
  posterUploadId,
} from "../media-fixtures";
import { mapUploadFinalizeResult } from "@/core/contracts/server/media";

describe("M11-3 seam: confirmed chat upload -> pending attachment draft", () => {
  test("uses the server-echoed MIME type/byteSize/filename/duration but the client-measured width/height", () => {
    const finalized = mapUploadFinalizeResult(chatUploadFinalizeResultWire);
    if (finalized.scope !== "chat") throw new Error("expected chat scope");
    const draft = toPendingAttachmentDraft(finalized, {
      uri: "file:///tmp/a.jpg",
      name: "a.jpg",
      byteSize: 12345,
      contentType: "image/jpeg",
      width: 640,
      height: 480,
    });
    expect(draft).toEqual({
      mediaUploadId: finalized.upload.id,
      type: "image/jpeg",
      byteSize: 12345,
      filename: "photo.jpg",
      width: 640,
      height: 480,
      duration: null,
      posterMediaId: null,
    });
  });

  test("carries a bound poster_upload_id through as the draft's posterMediaId", () => {
    const finalized = mapUploadFinalizeResult({
      ...chatUploadFinalizeResultWire,
      upload: {
        ...chatUploadFinalizeResultWire.upload,
        poster_upload_id: posterUploadId,
      },
    });
    if (finalized.scope !== "chat") throw new Error("expected chat scope");
    const draft = toPendingAttachmentDraft(finalized, {
      uri: "file:///tmp/a.jpg",
      name: "a.jpg",
      byteSize: 12345,
      contentType: "image/jpeg",
      width: 640,
      height: 480,
    });
    expect(draft.posterMediaId).toBe(posterUploadId);
  });
});
