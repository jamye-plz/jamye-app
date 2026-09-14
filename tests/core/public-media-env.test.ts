import { getPublicEnv, parsePublicMediaOrigin } from "@/core/config/public-env";

describe("M11 configured signed-media origin", () => {
  const original = {
    appMode: process.env.EXPO_PUBLIC_APP_MODE,
    api: process.env.EXPO_PUBLIC_API_ORIGIN,
    media: process.env.EXPO_PUBLIC_MEDIA_ORIGIN,
  };
  afterEach(() => {
    for (const [name, value] of Object.entries({
      EXPO_PUBLIC_APP_MODE: original.appMode,
      EXPO_PUBLIC_API_ORIGIN: original.api,
      EXPO_PUBLIC_MEDIA_ORIGIN: original.media,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  test("configured media origin stays separate from API and is normalized only as an origin", () => {
    process.env.EXPO_PUBLIC_APP_MODE = "connected-auth";
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
    process.env.EXPO_PUBLIC_MEDIA_ORIGIN = "https://media.example.com/";
    expect(getPublicEnv()).toEqual({
      appMode: "connected-auth",
      apiOrigin: "https://api.example.com",
      mediaOrigin: "https://media.example.com",
    });
  });
  test("missing media config preserves login/text and does not invent a media origin", () => {
    process.env.EXPO_PUBLIC_APP_MODE = "connected-auth";
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
    delete process.env.EXPO_PUBLIC_MEDIA_ORIGIN;
    expect(getPublicEnv()).not.toHaveProperty("mediaOrigin");
  });
  test.each([
    undefined,
    "",
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
