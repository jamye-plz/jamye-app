import * as Crypto from "expo-crypto";

function base64Url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function createPkcePair(): Promise<
  Readonly<{ verifier: string; challenge: string }>
> {
  const bytes = Crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(bytes);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return {
    verifier,
    challenge: digest
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, ""),
  };
}
