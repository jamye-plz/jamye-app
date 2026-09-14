import {
  evaluateChatSendComposition,
  evaluateMediaContentPolicy,
  isAuthoritativeAudioDuration,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "@/features/media/model/media-policy";

function file(
  overrides: Partial<Parameters<typeof evaluateMediaContentPolicy>[1]>,
) {
  return {
    uri: "file:///tmp/a",
    name: "a.jpg",
    byteSize: 1024,
    contentType: "image/jpeg",
    width: 100,
    height: 100,
    ...overrides,
  };
}

describe("M11-2 media content policy", () => {
  test.each(["image/jpeg", "image/png", "image/webp", "image/gif"])(
    "accepts %s for chat and topic scope within the size limit",
    (contentType) => {
      for (const scope of ["chat", "topic"] as const) {
        expect(
          evaluateMediaContentPolicy(
            scope,
            file({ contentType, byteSize: MAX_IMAGE_BYTES }),
          ),
        ).toEqual({ ok: true, kind: "image" });
      }
    },
  );

  test("rejects an image one byte over the 10 MiB limit", () => {
    expect(
      evaluateMediaContentPolicy(
        "chat",
        file({ byteSize: MAX_IMAGE_BYTES + 1 }),
      ),
    ).toEqual({ ok: false, reason: "file_too_large" });
  });

  test("accepts video/mp4 for chat at the 50 MiB boundary but not for topic", () => {
    expect(
      evaluateMediaContentPolicy(
        "chat",
        file({ contentType: "video/mp4", byteSize: MAX_VIDEO_BYTES }),
      ),
    ).toEqual({ ok: true, kind: "video" });
    expect(
      evaluateMediaContentPolicy(
        "topic",
        file({ contentType: "video/mp4", byteSize: MAX_VIDEO_BYTES }),
      ),
    ).toEqual({ ok: false, reason: "scope_not_allowed" });
  });

  test.each(["audio/webm", "audio/mp4", "audio/ogg"])(
    "accepts %s for chat at the 15 MiB boundary but not for topic",
    (contentType) => {
      expect(
        evaluateMediaContentPolicy(
          "chat",
          file({ contentType, byteSize: MAX_AUDIO_BYTES }),
        ),
      ).toEqual({ ok: true, kind: "audio" });
      expect(
        evaluateMediaContentPolicy(
          "topic",
          file({ contentType, byteSize: MAX_AUDIO_BYTES }),
        ),
      ).toEqual({ ok: false, reason: "scope_not_allowed" });
    },
  );

  test.each(["image/heic", "video/quicktime", "application/octet-stream", ""])(
    "rejects unsupported/unknown MIME %s instead of relabeling it",
    (contentType) => {
      expect(evaluateMediaContentPolicy("chat", file({ contentType }))).toEqual(
        { ok: false, reason: "unsupported_mime" },
      );
    },
  );

  test.each([0, -1, 1.5])(
    "rejects a non-positive or non-integer byteSize %s",
    (byteSize) => {
      expect(evaluateMediaContentPolicy("chat", file({ byteSize }))).toEqual({
        ok: false,
        reason: "empty_file",
      });
    },
  );

  test("rejects a filename over 255 characters", () => {
    expect(
      evaluateMediaContentPolicy("chat", file({ name: "a".repeat(256) })),
    ).toEqual({ ok: false, reason: "filename_too_long" });
  });

  test("a null filename is allowed", () => {
    expect(evaluateMediaContentPolicy("chat", file({ name: null }))).toEqual({
      ok: true,
      kind: "image",
    });
  });
});

describe("C4 chat attachment composition", () => {
  test("rejects an empty body with no attachments", () => {
    expect(
      evaluateChatSendComposition({ body: null, attachments: [] }),
    ).toEqual({ ok: false, reason: "no_content" });
    expect(evaluateChatSendComposition({ body: "", attachments: [] })).toEqual({
      ok: false,
      reason: "no_content",
    });
  });

  test("accepts a body with no attachments", () => {
    expect(
      evaluateChatSendComposition({ body: "안녕", attachments: [] }),
    ).toEqual({ ok: true });
  });

  test("accepts up to four unique ordered non-audio attachments, with or without a body", () => {
    const attachments = [1, 2, 3, 4].map((n) => ({
      mediaUploadId: `id-${n}`,
      kind: "image" as const,
    }));
    expect(evaluateChatSendComposition({ body: null, attachments })).toEqual({
      ok: true,
    });
    expect(evaluateChatSendComposition({ body: "본문", attachments })).toEqual({
      ok: true,
    });
  });

  test("rejects a fifth non-audio attachment", () => {
    const attachments = [1, 2, 3, 4, 5].map((n) => ({
      mediaUploadId: `id-${n}`,
      kind: "image" as const,
    }));
    expect(evaluateChatSendComposition({ body: null, attachments })).toEqual({
      ok: false,
      reason: "too_many_attachments",
    });
  });

  test("rejects a duplicate upload reference", () => {
    expect(
      evaluateChatSendComposition({
        body: null,
        attachments: [
          { mediaUploadId: "id-1", kind: "image" },
          { mediaUploadId: "id-1", kind: "image" },
        ],
      }),
    ).toEqual({ ok: false, reason: "duplicate_attachment" });
  });

  test("accepts exactly one bodyless audio attachment", () => {
    expect(
      evaluateChatSendComposition({
        body: null,
        attachments: [{ mediaUploadId: "id-1", kind: "audio" }],
      }),
    ).toEqual({ ok: true });
  });

  test("rejects audio combined with a body", () => {
    expect(
      evaluateChatSendComposition({
        body: "본문",
        attachments: [{ mediaUploadId: "id-1", kind: "audio" }],
      }),
    ).toEqual({ ok: false, reason: "audio_must_be_alone_and_bodyless" });
  });

  test("rejects audio combined with another attachment", () => {
    expect(
      evaluateChatSendComposition({
        body: null,
        attachments: [
          { mediaUploadId: "id-1", kind: "audio" },
          { mediaUploadId: "id-2", kind: "image" },
        ],
      }),
    ).toEqual({ ok: false, reason: "audio_must_be_alone_and_bodyless" });
  });
});

describe("MD2 audio duration authority", () => {
  test.each([1, 165, 330])("accepts the authoritative duration %s", (value) => {
    expect(isAuthoritativeAudioDuration(value)).toBe(true);
  });

  test.each([null, 0, -1, 331, 1.5])(
    "rejects a non-positive, over-limit, non-integer or missing duration %s",
    (value) => {
      expect(isAuthoritativeAudioDuration(value)).toBe(false);
    },
  );
});
