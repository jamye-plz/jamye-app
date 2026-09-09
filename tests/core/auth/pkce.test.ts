import { createPkcePair } from "@/core/auth/pkce";

jest.mock("expo-crypto", () => ({
  getRandomValues: (target: Uint8Array) => {
    target.fill(1);
    return target;
  },
  digestStringAsync: jest.fn(async () => "AQI="),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { BASE64: "base64" },
}));

describe("PKCE generation", () => {
  test("creates a URL-safe verifier and SHA-256 challenge without persisting either", async () => {
    globalThis.btoa = () => "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
    await expect(createPkcePair()).resolves.toEqual({
      verifier: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
      challenge: "AQI",
    });
  });
});
