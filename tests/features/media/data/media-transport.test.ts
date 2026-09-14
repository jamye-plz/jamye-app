import {
  MediaOriginError,
  requireMediaOriginUrl,
} from "@/features/media/data/media-transport";

const ORIGIN = "https://media.example.com";

describe("M11-1 signed URL origin validation", () => {
  test("accepts a same-origin HTTPS URL and never rejects on query bytes", () => {
    expect(() =>
      requireMediaOriginUrl(
        `${ORIGIN}/bucket/chat/a%20b.jpg?X-Signature=abc%3D%3D&X-Expires=3600`,
        ORIGIN,
      ),
    ).not.toThrow();
  });

  test("rejects a different origin", () => {
    expect(() =>
      requireMediaOriginUrl("https://evil.example.com/bucket/x", ORIGIN),
    ).toThrow(MediaOriginError);
  });

  test("rejects http (non-HTTPS)", () => {
    expect(() =>
      requireMediaOriginUrl("http://media.example.com/bucket/x", ORIGIN),
    ).toThrow(MediaOriginError);
  });

  test("rejects embedded userinfo", () => {
    expect(() =>
      requireMediaOriginUrl("https://user:pass@media.example.com/x", ORIGIN),
    ).toThrow(MediaOriginError);
  });

  test("rejects a fragment", () => {
    expect(() =>
      requireMediaOriginUrl("https://media.example.com/x#frag", ORIGIN),
    ).toThrow(MediaOriginError);
  });

  test("rejects a malformed URL", () => {
    expect(() => requireMediaOriginUrl("not a url", ORIGIN)).toThrow(
      MediaOriginError,
    );
  });
});
