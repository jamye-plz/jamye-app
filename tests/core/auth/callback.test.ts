import { parseOAuthCallback } from "@/core/auth/callback";
import {
  inviteCodeFromNativeIntentPath,
  redirectSystemPath,
} from "@/app/+native-intent";
import { pendingInviteStore } from "@/features/groups/model/pending-invite-store";

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

const validCode = "a".repeat(20);

describe("invite deep link boundary (A3/L2/E7/ADR 0012)", () => {
  beforeEach(() => pendingInviteStore.clear());

  test.each([
    [
      "full https Universal Link",
      `https://jamye-api.ridewithmin.com/invite/${validCode}`,
    ],
    ["bare /invite/ path", `/invite/${validCode}`],
    ["jamye:// custom scheme", `jamye://invite/${validCode}`],
  ] as const)(
    "%s: extracts the code, stores it, and routes to the code-less join screen (initial or warm)",
    (_label, path) => {
      for (const initial of [true, false]) {
        pendingInviteStore.clear();
        expect(inviteCodeFromNativeIntentPath(path)).toBe(validCode);
        const target = redirectSystemPath({ path, initial });
        expect(target).toBe("/groups/join");
        expect(target).not.toContain(validCode);
        expect(JSON.stringify(target)).not.toContain(validCode);
        expect(pendingInviteStore.consume()).toBe(validCode);
      }
    },
  );

  test.each([
    ["too short", `jamye://invite/${"a".repeat(15)}`],
    ["too long", `jamye://invite/${"a".repeat(65)}`],
    ["disallowed character", `jamye://invite/${"a".repeat(19)}!`],
    ["different host", `https://evil.example.com/invite/${validCode}`],
  ] as const)(
    "rejects an invalid or untrusted invite link (%s) and goes home",
    (_label, path) => {
      expect(inviteCodeFromNativeIntentPath(path)).toBeNull();
      expect(redirectSystemPath({ path, initial: true })).toBe("/");
      expect(pendingInviteStore.peek()).toBeNull();
    },
  );

  test("oauth callbacks are unaffected by the invite check", () => {
    const state = "a".repeat(43);
    expect(
      redirectSystemPath({
        path: `jamye://oauth/kakao?code=code-1&state=${state}`,
        initial: true,
      }),
    ).toBe("/oauth/kakao");
    expect(pendingInviteStore.peek()).toBeNull();
  });
});
