import {
  validateUploadIntentCreate,
  validateUploadFinalize,
  validateUploadFinalizeResult,
  validateMediaAccessUrl,
  validateTopicMediaPage,
  validateMessageCreate,
} from "@/core/contracts/server";

const id = "11111111-1111-4111-8111-111111111111";
const upload = {
  id,
  scope: "chat",
  target_id: id,
  object_key: "chat/fixture",
  kind: "audio",
  content_type: "audio/ogg",
  byte_size: 100,
  duration: 30,
  filename: "voice.ogg",
  confirmed_at: "2026-09-10T00:00:00Z",
};

describe("M11 server media runtime contract", () => {
  test.each([
    ["image/jpeg", 10 * 1024 * 1024],
    ["image/png", 10 * 1024 * 1024],
    ["image/webp", 10 * 1024 * 1024],
    ["image/gif", 10 * 1024 * 1024],
    ["video/mp4", 50 * 1024 * 1024],
    ["audio/webm", 15 * 1024 * 1024],
    ["audio/mp4", 15 * 1024 * 1024],
    ["audio/ogg", 15 * 1024 * 1024],
  ])("MD1 enforces the exact %s size boundary", (content_type, byte_size) => {
    const input = { scope: "chat", target_id: id, content_type, byte_size };
    expect(validateUploadIntentCreate(input)).toBe(true);
    expect(
      validateUploadIntentCreate({ ...input, byte_size: byte_size + 1 }),
    ).toBe(false);
    expect(validateUploadIntentCreate({ ...input, byte_size: 0 })).toBe(false);
  });

  test("MD1 rejects unsupported MIME, nonimage topic uploads, unowned object keys and long filenames", () => {
    const input = {
      scope: "topic",
      target_id: id,
      content_type: "image/png",
      byte_size: 1,
    };
    expect(validateUploadIntentCreate(input)).toBe(true);
    for (const content_type of [
      "image/heic",
      "image/avif",
      "video/quicktime",
      "video/mp4",
      "audio/ogg",
    ]) {
      expect(validateUploadIntentCreate({ ...input, content_type })).toBe(
        false,
      );
    }
    expect(
      validateUploadIntentCreate({ ...input, object_key: "arbitrary" }),
    ).toBe(false);
    expect(
      validateUploadIntentCreate({ ...input, filename: "가".repeat(256) }),
    ).toBe(false);
  });

  test("MD2 accepts dimensions only and the server's audio duration remains authoritative", () => {
    expect(validateUploadFinalize({})).toBe(true);
    expect(validateUploadFinalize({ width: 10, height: 20 })).toBe(true);
    expect(validateUploadFinalize({ duration: 30 })).toBe(false);
    expect(validateUploadFinalize({ width: 0 })).toBe(false);
    const result = {
      scope: "chat",
      status: "confirmed",
      bound: false,
      upload,
      topic_media: null,
      topic_status: null,
    };
    expect(validateUploadFinalizeResult(result)).toBe(true);
    expect(validateUploadFinalizeResult({ ...result, bound: true })).toBe(
      false,
    );
    expect(
      validateUploadFinalizeResult({
        ...result,
        upload: { ...upload, duration: 0 },
      }),
    ).toBe(false);
  });

  test("MD3 pagination and MD4 IDs/TTL are not collapsed into an upload ID", () => {
    expect(
      validateTopicMediaPage({ items: [], next_cursor: "opaque+/=" }),
    ).toBe(true);
    expect(validateTopicMediaPage({ items: [] })).toBe(false);
    const access = {
      id,
      media_upload_id: "22222222-2222-4222-8222-222222222222",
      url: "https://media.example.com/file?signature=test",
      content_type: "image/png",
      byte_size: 1,
      width: null,
      height: null,
      duration: null,
      filename: null,
      expires_in: 600,
    };
    expect(validateMediaAccessUrl(access)).toBe(true);
    expect(validateMediaAccessUrl({ ...access, expires_in: 3600 })).toBe(false);
    expect(validateMediaAccessUrl({ ...access, object_key: "private" })).toBe(
      false,
    );
  });

  test("C4 bodyless media uses upload references, never signed URLs", () => {
    expect(
      validateMessageCreate({
        client_msg_id: id,
        body: "",
        media: [{ media_upload_id: id }],
      }),
    ).toBe(true);
    expect(validateMessageCreate({ client_msg_id: id, body: "" })).toBe(false);
    expect(
      validateMessageCreate({
        client_msg_id: id,
        media: [{ media_upload_id: id, url: "https://media.example.com" }],
      }),
    ).toBe(false);
  });
});
