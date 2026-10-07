import { getPublicEnv, parsePublicMediaOrigin } from "@/core/config/public-env";

describe("M11 configured signed-media origin", () => {
  const original = {
    api: process.env.EXPO_PUBLIC_API_ORIGIN,
    media: process.env.EXPO_PUBLIC_MEDIA_ORIGIN,
  };
  afterEach(() => {
    for (const [name, value] of Object.entries({
      EXPO_PUBLIC_API_ORIGIN: original.api,
      EXPO_PUBLIC_MEDIA_ORIGIN: original.media,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  test("configured media origin stays separate from API and is normalized only as an origin", () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
    process.env.EXPO_PUBLIC_MEDIA_ORIGIN = "https://media.example.com/";
    expect(getPublicEnv()).toEqual({
      apiOrigin: "https://api.example.com",
      mediaOrigin: "https://media.example.com",
    });
  });
  test("missing media config is a startup error and never invents a media origin", () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
    delete process.env.EXPO_PUBLIC_MEDIA_ORIGIN;
    expect(() => getPublicEnv()).toThrow(
      "EXPO_PUBLIC_MEDIA_ORIGIN is required.",
    );
    expect(() => parsePublicMediaOrigin("")).toThrow(
      "EXPO_PUBLIC_MEDIA_ORIGIN is required.",
    );
  });
  test.each([
    "not a url",
    "http://media.example.com",
    "https://user:secret@media.example.com",
    "https://media.example.com/path",
    "https://media.example.com?token=private",
    "https://media.example.com/#private",
  ])("rejects nonorigin config without echoing values", (value) => {
    expect(() => parsePublicMediaOrigin(value)).toThrow(
      "EXPO_PUBLIC_MEDIA_ORIGIN must be a bare HTTPS origin.",
    );
  });
});
