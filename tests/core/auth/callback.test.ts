import { parseOAuthCallback } from "@/core/auth/callback";
import { redirectSystemPath } from "@/app/+native-intent";

const state = "a".repeat(43);

describe("OAuth callback boundary", () => {
  test("accepts only the expected provider, one state, and one success code", () => {
    expect(
      parseOAuthCallback(
        `jamye://oauth/kakao?code=code-1&state=${state}`,
        "kakao",
      ),
    ).toEqual({ kind: "success", code: "code-1", state });
  });
  test("normalizes provider errors and rejects mix-up, duplicates, metadata, and malformed state", () => {
    expect(
      parseOAuthCallback(
        `jamye://oauth/google?error=access_denied&state=${state}`,
        "google",
      ),
    ).toEqual({ kind: "error", error: "access_denied", state });
    for (const value of [
      `jamye://oauth/google?code=x&state=${state}`,
      `jamye://oauth/kakao?code=x&state=${state}&state=${state}`,
      `jamye://oauth/kakao?code=x&error=&state=${state}`,
      `jamye://oauth/kakao?code=%00&state=${state}`,
      `jamye://oauth/kakao?code=x&state=${state}&scope=a`,
      "jamye://oauth/kakao?code=x&state=short",
    ])
      expect(() => parseOAuthCallback(value, "kakao")).toThrow(/callback/i);
  });
  test("native intent removes raw query before routing and rejects non-callback external input", () => {
    expect(
      redirectSystemPath({
        path: `jamye://oauth/kakao?code=secret&state=${state}`,
        initial: true,
      }),
    ).toBe("/oauth/kakao");
    expect(
      redirectSystemPath({
        path: "jamye://oauth/evil?code=secret",
        initial: true,
      }),
    ).toBe("/");
    expect(
      redirectSystemPath({ path: "/chat?code=secret", initial: false }),
    ).toBe("/chat");
  });
});
