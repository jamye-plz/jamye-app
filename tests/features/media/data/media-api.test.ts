import { createMediaApi, MediaApiError } from "@/features/media/data/media-api";
import type { MediaHttpResponse } from "@/features/media/data/media-transport";
import {
  chatUploadFinalizeResultWire,
  mediaAccessUrlWire,
  mediaId,
  otherId,
  targetId,
  topicId,
  topicMediaPageWire,
  topicMediaWire,
  topicUploadFinalizeResultWire,
  uploadId,
  uploadIntentWithPresignedPutWire,
} from "../media-fixtures";

const API_ORIGIN = "https://api.example.com";
const MEDIA_ORIGIN = "https://media.example.com";

describe("M11-1 media transport contract", () => {
  const fetchMock = jest.fn();
  const transport = { fetch: fetchMock };
  const api = createMediaApi(API_ORIGIN, MEDIA_ORIGIN, transport);

  function reply(
    value: unknown,
    status = 200,
    headers: Readonly<Record<string, string>> = {},
  ): void {
    const response: MediaHttpResponse = {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: jest.fn().mockResolvedValue(value),
    };
    fetchMock.mockResolvedValueOnce(response);
  }

  beforeEach(() => {
    fetchMock.mockReset();
  });

  test("MD1 sends a bearer JSON POST and validates the presigned PUT origin", async () => {
    reply(uploadIntentWithPresignedPutWire, 201);
    const value = await api.createUpload("token", {
      scope: "chat",
      targetId,
      contentType: "image/jpeg",
      byteSize: 12345,
      filename: "photo.jpg",
    });
    expect(value.upload.id).toBe(uploadId);
    expect(value.put.url).toBe(uploadIntentWithPresignedPutWire.put.url);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ORIGIN}/api/v1/media/uploads`,
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        redirect: "error",
        body: JSON.stringify({
          scope: "chat",
          target_id: targetId,
          content_type: "image/jpeg",
          byte_size: 12345,
          filename: "photo.jpg",
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  test("MD1 rejects a presigned PUT url on the wrong origin", async () => {
    reply(
      {
        ...uploadIntentWithPresignedPutWire,
        put: {
          url: "https://evil.example.com/bucket/x?sig=abc",
          expires_in: 3600,
        },
      },
      201,
    );
    await expect(
      api.createUpload("token", {
        scope: "chat",
        targetId,
        contentType: "image/jpeg",
        byteSize: 12345,
      }),
    ).rejects.toMatchObject({ status: 502, code: "invalid_media_origin_url" });
  });

  test("MD1 rejects a response whose scope/target/content_type/byte_size drift from the request", async () => {
    reply(
      {
        ...uploadIntentWithPresignedPutWire,
        upload: {
          ...uploadIntentWithPresignedPutWire.upload,
          target_id: otherId,
        },
      },
      201,
    );
    await expect(
      api.createUpload("token", {
        scope: "chat",
        targetId,
        contentType: "image/jpeg",
        byteSize: 12345,
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  test("MD1 rejects an invalid target id before any I/O", async () => {
    await expect(
      api.createUpload("token", {
        scope: "chat",
        targetId: "not-a-uuid",
        contentType: "image/jpeg",
        byteSize: 12345,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("MD2 chat finalize maps the unbound confirmed upload and checks identity", async () => {
    reply(chatUploadFinalizeResultWire);
    const value = await api.finalizeUpload("token", uploadId, {
      width: null,
      height: null,
    });
    expect(value).toMatchObject({ scope: "chat", bound: false });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ORIGIN}/api/v1/media/uploads/${uploadId}/finalize`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ width: null, height: null }),
      }),
    );
  });

  test("finalize serializes poster_upload_id only when it is a string, never null/undefined", async () => {
    reply(chatUploadFinalizeResultWire);
    await api.finalizeUpload("token", uploadId, {
      posterUploadId: "22222222-2222-4222-8222-222222222222",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ORIGIN}/api/v1/media/uploads/${uploadId}/finalize`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          poster_upload_id: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );
    reply(chatUploadFinalizeResultWire);
    await api.finalizeUpload("token", uploadId, { posterUploadId: null });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${API_ORIGIN}/api/v1/media/uploads/${uploadId}/finalize`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
    );
    reply(chatUploadFinalizeResultWire);
    await api.finalizeUpload("token", uploadId, {});
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${API_ORIGIN}/api/v1/media/uploads/${uploadId}/finalize`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
    );
  });

  test("MD2 topic finalize maps the bound branch and checks upload/topic_media identity", async () => {
    reply(topicUploadFinalizeResultWire);
    const value = await api.finalizeUpload("token", uploadId, {});
    expect(value).toMatchObject({
      scope: "topic",
      bound: true,
      topicStatus: "enriched",
    });
  });

  test("MD2 rejects a response whose confirmed upload id does not match the requested upload_id", async () => {
    reply({
      ...chatUploadFinalizeResultWire,
      upload: { ...chatUploadFinalizeResultWire.upload, id: otherId },
    });
    await expect(
      api.finalizeUpload("token", uploadId, {}),
    ).rejects.toMatchObject({ status: 502 });
  });

  test("MD3 lists topic media and rejects cross-topic items", async () => {
    reply(topicMediaPageWire);
    const page = await api.listTopicMedia("token", topicId, { limit: 20 });
    expect(page.items).toEqual([
      {
        id: mediaId,
        topicId,
        mediaUploadId: uploadId,
        contentType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 12345,
        createdAt: topicMediaWire.created_at,
      },
    ]);
    reply({
      items: [{ ...topicMediaWire, topic_id: otherId }],
      next_cursor: null,
    });
    await expect(
      api.listTopicMedia("token", topicId, {}),
    ).rejects.toMatchObject({ status: 502 });
  });

  test("MD3 rejects an out-of-range page limit before I/O", async () => {
    await expect(
      api.listTopicMedia("token", topicId, { limit: 101 }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("MD4 returns the reissued access url and validates its origin/identity", async () => {
    reply(mediaAccessUrlWire);
    const value = await api.getAccess("token", mediaId);
    expect(value.url).toBe(mediaAccessUrlWire.url);
    reply({ ...mediaAccessUrlWire, id: otherId });
    await expect(api.getAccess("token", mediaId)).rejects.toMatchObject({
      status: 502,
    });
    reply({
      ...mediaAccessUrlWire,
      url: "https://evil.example.com/bucket/x?sig=abc",
    });
    await expect(api.getAccess("token", mediaId)).rejects.toMatchObject({
      status: 502,
      code: "invalid_media_origin_url",
    });
  });

  test("MD5 captures the 307 Location without following it or parsing JSON", async () => {
    const location = "https://media.example.com/bucket/download?sig=xyz";
    reply(null, 307, { location });
    const value = await api.getDownloadLocation("token", mediaId);
    expect(value).toEqual({ location });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ORIGIN}/api/v1/media/${mediaId}/download`,
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "manual",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });

  test("MD5 rejects a Location on the wrong origin", async () => {
    reply(null, 307, { location: "https://evil.example.com/x?sig=abc" });
    await expect(
      api.getDownloadLocation("token", mediaId),
    ).rejects.toMatchObject({ status: 502, code: "invalid_media_origin_url" });
  });

  test("MD5 rejects a missing Location on a reported 307", async () => {
    reply(null, 307, {});
    await expect(
      api.getDownloadLocation("token", mediaId),
    ).rejects.toMatchObject({ status: 502, code: "missing_download_location" });
  });

  test("MD5 surfaces the shared ErrorEnvelope on a non-redirect status", async () => {
    reply(
      {
        error: {
          code: "media_forbidden",
          message: "secret-detail",
          request_id: otherId,
          details: null,
        },
      },
      403,
    );
    try {
      await api.getDownloadLocation("token", mediaId);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toMatchObject({ status: 403, code: "media_forbidden" });
      expect(String(error)).not.toContain("secret-detail");
    }
  });

  test.each([401, 403, 404, 409, 422, 503])(
    "keeps safe error code and status %s without raw secrets",
    async (status) => {
      reply(
        {
          error: {
            code: "media_owner_required",
            message: "secret-input",
            request_id: otherId,
            details: null,
          },
        },
        status,
      );
      try {
        await api.getAccess("token", mediaId);
        throw new Error("expected rejection");
      } catch (error) {
        expect(error).toMatchObject({ status });
        expect(String(error)).not.toContain("secret-input");
      }
    },
  );

  test("network failures and caller cancellation are safe and distinguishable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("secret-url"));
    await expect(api.getAccess("token", mediaId)).rejects.toMatchObject({
      status: 0,
      code: "network_unavailable",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.getAccess("token", mediaId, controller.signal),
    ).rejects.toMatchObject({ code: "request_cancelled" });
  });

  test("MediaApiError never leaks into a generic Error instance check bypass", () => {
    const error = new MediaApiError(422, "invalid_upload_intent_create");
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(422);
  });
});
