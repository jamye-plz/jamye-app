import { getPublicEnv, parsePublicApiOrigin } from "@/core/config/public-env";

const ORIGINAL_ENV = {
  EXPO_PUBLIC_API_ORIGIN: process.env.EXPO_PUBLIC_API_ORIGIN,
  EXPO_PUBLIC_MEDIA_ORIGIN: process.env.EXPO_PUBLIC_MEDIA_ORIGIN,
};

afterEach(() => {
  for (const [name, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("public environment contract", () => {
  test("returns the API and media origins normalized to bare HTTPS origins", () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com/";
    process.env.EXPO_PUBLIC_MEDIA_ORIGIN = "https://media.example.com";

    expect(getPublicEnv()).toEqual({
      apiOrigin: "https://api.example.com",
      mediaOrigin: "https://media.example.com",
    });
  });

  test("a missing API origin throws an error that names the variable", () => {
    delete process.env.EXPO_PUBLIC_API_ORIGIN;
    process.env.EXPO_PUBLIC_MEDIA_ORIGIN = "https://media.example.com";

    expect(() => getPublicEnv()).toThrow("EXPO_PUBLIC_API_ORIGIN is required.");
  });

  test("a missing media origin throws an error that names the variable", () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
    delete process.env.EXPO_PUBLIC_MEDIA_ORIGIN;

    expect(() => getPublicEnv()).toThrow(
      "EXPO_PUBLIC_MEDIA_ORIGIN is required.",
    );
  });

  test("an empty origin is treated as missing", () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = "";
    process.env.EXPO_PUBLIC_MEDIA_ORIGIN = "https://media.example.com";

    expect(() => getPublicEnv()).toThrow("EXPO_PUBLIC_API_ORIGIN is required.");
  });

  test("an invalid API origin is rejected at startup", () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = "http://api.example.com";
    process.env.EXPO_PUBLIC_MEDIA_ORIGIN = "https://media.example.com";

    expect(() => getPublicEnv()).toThrow(
      "EXPO_PUBLIC_API_ORIGIN must be a bare HTTPS origin.",
    );
  });

  test("API origin parser distinguishes missing, malformed, and non-bare input", () => {
    expect(() => parsePublicApiOrigin(undefined)).toThrow(
      "EXPO_PUBLIC_API_ORIGIN is required.",
    );
    expect(() => parsePublicApiOrigin("not a url")).toThrow(
      "EXPO_PUBLIC_API_ORIGIN must be a valid HTTPS origin.",
    );
    for (const value of [
      "http://api.example.com",
      "https://user:secret@api.example.com",
      "https://api.example.com/path",
      "https://api.example.com?token=private",
      "https://api.example.com/#private",
    ]) {
      expect(() => parsePublicApiOrigin(value)).toThrow(
        "EXPO_PUBLIC_API_ORIGIN must be a bare HTTPS origin.",
      );
    }
  });
});
