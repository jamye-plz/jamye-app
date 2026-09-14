import { evaluateSelectedMedia } from "@/features/media/platform/media-policy";

describe("M11 platform media policy (Korean-message layer)", () => {
  test("accepts a valid chat image and reports its kind", () => {
    expect(
      evaluateSelectedMedia("chat", {
        uri: "file:///a.jpg",
        name: "a.jpg",
        byteSize: 1024,
        contentType: "image/jpeg",
        width: 100,
        height: 100,
      }),
    ).toEqual({ accepted: true, kind: "image" });
  });

  test("rejects HEIC with a specific, non-generic Korean message", () => {
    const result = evaluateSelectedMedia("chat", {
      uri: "file:///a.heic",
      name: "a.heic",
      byteSize: 1024,
      contentType: "image/heic",
      width: 100,
      height: 100,
    });
    expect(result).toEqual(
      expect.objectContaining({ accepted: false, reason: "unsupported_mime" }),
    );
    if (!result.accepted) expect(result.message.length).toBeGreaterThan(0);
  });

  test("rejects an oversized video", () => {
    const result = evaluateSelectedMedia("chat", {
      uri: "file:///a.mp4",
      name: "a.mp4",
      byteSize: 60 * 1024 * 1024,
      contentType: "video/mp4",
      width: 100,
      height: 100,
    });
    expect(result).toEqual(
      expect.objectContaining({ accepted: false, reason: "file_too_large" }),
    );
  });

  test("rejects a non-image attachment in topic scope", () => {
    const result = evaluateSelectedMedia("topic", {
      uri: "file:///a.mp4",
      name: "a.mp4",
      byteSize: 1024,
      contentType: "video/mp4",
      width: 100,
      height: 100,
    });
    expect(result).toEqual(
      expect.objectContaining({ accepted: false, reason: "scope_not_allowed" }),
    );
  });

  test("rejects an empty file", () => {
    const result = evaluateSelectedMedia("chat", {
      uri: "file:///a.jpg",
      name: "a.jpg",
      byteSize: 0,
      contentType: "image/jpeg",
      width: 100,
      height: 100,
    });
    expect(result).toEqual(
      expect.objectContaining({ accepted: false, reason: "empty_file" }),
    );
  });
});
