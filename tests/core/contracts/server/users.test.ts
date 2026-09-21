import { userPatchToWire, validateUserPatch } from "@/core/contracts/server";

describe("U2 UserPatch wire contract", () => {
  test("validateUserPatch accepts an empty patch (all fields omitted)", () => {
    expect(validateUserPatch({})).toBe(true);
  });

  test("validateUserPatch accepts a nickname-only patch", () => {
    expect(validateUserPatch({ nickname: "지민" })).toBe(true);
  });

  test("validateUserPatch accepts an avatar_url-only patch, including null (clear)", () => {
    expect(
      validateUserPatch({ avatar_url: "https://cdn.example.com/a.png" }),
    ).toBe(true);
    expect(validateUserPatch({ avatar_url: null })).toBe(true);
  });

  test("validateUserPatch accepts both fields set together", () => {
    expect(
      validateUserPatch({
        avatar_url: "https://cdn.example.com/a.png",
        nickname: "지민",
      }),
    ).toBe(true);
  });

  test("validateUserPatch rejects an empty-string nickname (minLength 1)", () => {
    expect(validateUserPatch({ nickname: "" })).toBe(false);
  });

  test("validateUserPatch rejects a nickname over 64 chars", () => {
    expect(validateUserPatch({ nickname: "x".repeat(65) })).toBe(false);
  });

  test("validateUserPatch rejects an avatar_url over 512 chars", () => {
    expect(validateUserPatch({ avatar_url: "x".repeat(513) })).toBe(false);
  });

  test("validateUserPatch rejects an unrecognized property (additionalProperties:false)", () => {
    expect(validateUserPatch({ unexpected: "value" })).toBe(false);
  });

  test("userPatchToWire omits both keys when input is empty", () => {
    expect(userPatchToWire({})).toEqual({});
  });

  test("userPatchToWire includes nickname only when set, omitting avatar_url", () => {
    const wire = userPatchToWire({ nickname: "새 닉네임" });
    expect(wire).toEqual({ nickname: "새 닉네임" });
    expect(validateUserPatch(wire)).toBe(true);
  });

  test("userPatchToWire includes avatar_url:null when clearing, omitting nickname", () => {
    const wire = userPatchToWire({ avatarUrl: null });
    expect(wire).toEqual({ avatar_url: null });
    expect(validateUserPatch(wire)).toBe(true);
  });

  test("userPatchToWire includes avatar_url as a string when set", () => {
    const wire = userPatchToWire({
      avatarUrl: "https://cdn.example.com/a.png",
    });
    expect(wire).toEqual({ avatar_url: "https://cdn.example.com/a.png" });
    expect(validateUserPatch(wire)).toBe(true);
  });

  test("userPatchToWire includes both keys when both are set", () => {
    const wire = userPatchToWire({ avatarUrl: null, nickname: "새 닉네임" });
    expect(wire).toEqual({ avatar_url: null, nickname: "새 닉네임" });
    expect(validateUserPatch(wire)).toBe(true);
  });

  test("userPatchToWire never emits nickname:null (non-nullable by design)", () => {
    const wire = userPatchToWire({ nickname: "새 닉네임" });
    expect(Object.prototype.hasOwnProperty.call(wire, "nickname")).toBe(true);
    expect((wire as { nickname?: unknown }).nickname).not.toBeNull();
  });
});
