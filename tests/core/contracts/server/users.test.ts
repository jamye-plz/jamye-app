import { userPatchToWire, validateUserPatch } from "@/core/contracts/server";

describe("U2 UserPatch wire contract", () => {
  test("validateUserPatch accepts an empty patch (all fields omitted)", () => {
    expect(validateUserPatch({})).toBe(true);
  });

  test("validateUserPatch accepts a nickname-only patch", () => {
    expect(validateUserPatch({ nickname: "지민" })).toBe(true);
  });

  test('validateUserPatch accepts an avatar_url-only patch; the wire schema allows null (a server no-op) and "" (clear)', () => {
    expect(
      validateUserPatch({ avatar_url: "https://cdn.example.com/a.png" }),
    ).toBe(true);
    expect(validateUserPatch({ avatar_url: null })).toBe(true);
    expect(validateUserPatch({ avatar_url: "" })).toBe(true);
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

  /**
   * S3 tightened the `User` response schema's avatar_url to null/""/an
   * https URL (see server-validators.test.ts's "S3 User.avatar_url..."
   * test), but left `UserPatch`'s request schema unchanged: length + type
   * only, no scheme pattern. The https-only rule (and its 422
   * request_validation_failed rejection) is enforced by server application
   * code, not the wire schema, so validateUserPatch intentionally still
   * accepts a non-https value here; the app sends avatar_url via U2 only to clear it
   * (""); a null is a server-side no-op and is never sent.
   */
  test("S3 validateUserPatch still accepts a non-https avatar_url (https-only is server-runtime validation, not a wire schema change)", () => {
    expect(
      validateUserPatch({ avatar_url: "http://cdn.example.com/a.png" }),
    ).toBe(true);
    expect(validateUserPatch({ avatar_url: "not-a-url" })).toBe(true);
    expect(validateUserPatch({ avatar_url: "" })).toBe(true);
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

  // AV-AC1: U2 treats `avatar_url: null` as a no-op; "" is the clear value.
  test('userPatchToWire sends avatar_url:"" when clearing, omitting nickname', () => {
    const wire = userPatchToWire({ avatarUrl: "" });
    expect(wire).toEqual({ avatar_url: "" });
    expect(validateUserPatch(wire)).toBe(true);
  });

  test('userPatchToWire never puts avatar_url:null on the wire (a legacy null clear becomes "")', () => {
    const wire = userPatchToWire({ avatarUrl: null });
    expect(wire).toEqual({ avatar_url: "" });
    expect((wire as { avatar_url?: unknown }).avatar_url).not.toBeNull();
  });

  test("userPatchToWire includes avatar_url as a string when set", () => {
    const wire = userPatchToWire({
      avatarUrl: "https://cdn.example.com/a.png",
    });
    expect(wire).toEqual({ avatar_url: "https://cdn.example.com/a.png" });
    expect(validateUserPatch(wire)).toBe(true);
  });

  test("userPatchToWire includes both keys when both are set", () => {
    const wire = userPatchToWire({ avatarUrl: "", nickname: "새 닉네임" });
    expect(wire).toEqual({ avatar_url: "", nickname: "새 닉네임" });
    expect(validateUserPatch(wire)).toBe(true);
  });

  test("userPatchToWire never emits nickname:null (non-nullable by design)", () => {
    const wire = userPatchToWire({ nickname: "새 닉네임" });
    expect(Object.prototype.hasOwnProperty.call(wire, "nickname")).toBe(true);
    expect((wire as { nickname?: unknown }).nickname).not.toBeNull();
  });
});
