import * as AppleAuthentication from "expo-apple-authentication";
import { appleAuthenticationPort } from "@/core/auth/apple-authentication-port.ios";
import { createAppleNonce } from "@/core/auth/apple-authentication.shared";

// The tsconfig has no Node types (`"types": ["jest"]`), so the few Node
// crypto calls these tests need are typed locally, like app-config.test.ts
// does for node:fs.
type NodeCrypto = {
  randomBytes: (size: number) => Uint8Array;
  createHash: (algorithm: string) => {
    update: (data: string) => { digest: (encoding: "hex") => string };
  };
};

// jest-expo's default expo-crypto stub returns zeroed bytes and an empty
// digest, so the nonce tests use Node's crypto for real randomness and a real
// SHA-256 (same idea as pkce.test.ts's inline expo-crypto mock).
jest.mock("expo-crypto", () => {
  const mockNodeCrypto = jest.requireActual("node:crypto") as NodeCrypto;
  return {
    getRandomValues: (target: Uint8Array) => {
      target.set(mockNodeCrypto.randomBytes(target.length));
      return target;
    },
    digestStringAsync: jest.fn(async (_algorithm: string, data: string) =>
      mockNodeCrypto.createHash("sha256").update(data).digest("hex"),
    ),
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { HEX: "hex", BASE64: "base64" },
  };
});

const mockIsAvailableAsync = jest.mocked(AppleAuthentication.isAvailableAsync);
const mockSignInAsync = jest.mocked(AppleAuthentication.signInAsync);
const mockFormatFullName = jest.mocked(AppleAuthentication.formatFullName);

describe("apple-authentication-port (iOS)", () => {
  beforeEach(() => {
    mockIsAvailableAsync.mockClear();
    mockIsAvailableAsync.mockResolvedValue(true);
    mockSignInAsync.mockReset();
    mockFormatFullName.mockClear();
  });

  test("isAvailableAsync delegates straight to the SDK", async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    await expect(appleAuthenticationPort.isAvailableAsync()).resolves.toBe(
      false,
    );
    expect(mockIsAvailableAsync).toHaveBeenCalledTimes(1);
  });

  test("signIn maps a successful credential and formats a present full name (U6 iOS locale order)", async () => {
    mockSignInAsync.mockResolvedValue({
      authorizationCode: "auth-code",
      email: null,
      fullName: { familyName: "김", givenName: "철수" } as never,
      identityToken: "identity-token",
      realUserStatus: 2,
      state: null,
      user: "apple-user",
    });
    mockFormatFullName.mockReturnValue("김철수");

    const result = await appleAuthenticationPort.signIn({
      nonce: "hashed-nonce",
      requestedScopes: ["fullName"],
    });

    expect(result).toEqual({
      type: "success",
      identityToken: "identity-token",
      authorizationCode: "auth-code",
      fullName: "김철수",
    });
    expect(mockSignInAsync).toHaveBeenCalledWith({
      nonce: "hashed-nonce",
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    });
  });

  test("leaves fullName absent when Apple returns no name (not first login, or the user denied it)", async () => {
    mockSignInAsync.mockResolvedValue({
      authorizationCode: "auth-code",
      email: null,
      fullName: null,
      identityToken: "identity-token",
      realUserStatus: 2,
      state: null,
      user: "apple-user",
    });

    const result = await appleAuthenticationPort.signIn({
      nonce: "hashed-nonce",
      requestedScopes: [],
    });

    expect(result).toEqual({
      type: "success",
      identityToken: "identity-token",
      authorizationCode: "auth-code",
      fullName: undefined,
    });
    expect(mockFormatFullName).not.toHaveBeenCalled();
  });

  test("resolves a silent cancel for ERR_REQUEST_CANCELED, never a thrown error", async () => {
    mockSignInAsync.mockRejectedValue(
      Object.assign(new Error("cancelled"), { code: "ERR_REQUEST_CANCELED" }),
    );

    await expect(
      appleAuthenticationPort.signIn({ nonce: "n", requestedScopes: [] }),
    ).resolves.toEqual({ type: "cancel" });
  });

  test("maps any other rejection to a retryable error carrying its message", async () => {
    mockSignInAsync.mockRejectedValue(new Error("network down"));

    await expect(
      appleAuthenticationPort.signIn({ nonce: "n", requestedScopes: [] }),
    ).resolves.toEqual({ type: "error", message: "network down" });
  });

  test("reports a missing identityToken/authorizationCode as an error instead of a malformed success", async () => {
    mockSignInAsync.mockResolvedValue({
      authorizationCode: null,
      email: null,
      fullName: null,
      identityToken: null,
      realUserStatus: 2,
      state: null,
      user: "apple-user",
    });

    const result = await appleAuthenticationPort.signIn({
      nonce: "n",
      requestedScopes: [],
    });
    expect(result.type).toBe("error");
  });
});

describe("createAppleNonce", () => {
  test("produces a raw/hashed hex pair where the hash is sha256(raw)", async () => {
    const { raw, hashed } = await createAppleNonce();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    const { createHash } = jest.requireActual("node:crypto") as NodeCrypto;
    expect(hashed).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(hashed).not.toBe(raw);
  });

  test("generates a fresh raw value on every call (never reused across sign-in attempts)", async () => {
    const first = await createAppleNonce();
    const second = await createAppleNonce();
    expect(first.raw).not.toBe(second.raw);
  });
});
