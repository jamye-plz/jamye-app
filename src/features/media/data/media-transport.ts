/**
 * Fetch-shaped port so `createMediaApi` never touches `globalThis.fetch`
 * directly: a native Expo-fetch-backed implementation and a test fake can
 * both satisfy this shape. `credentials` is fixed to "omit" on every call
 * (bearer auth travels in the Authorization header only, never cookies);
 * `redirect` is explicit per call ("error" for MD1-4 JSON operations,
 * "manual" for MD5's 307 capture).
 */
export type MediaHttpHeaders = Readonly<{
  get: (name: string) => string | null;
}>;

export type MediaHttpResponse = Readonly<{
  status: number;
  ok: boolean;
  headers: MediaHttpHeaders;
  json: () => Promise<unknown>;
}>;

export type MediaHttpRequestInit = Readonly<{
  method: "GET" | "POST";
  headers: Readonly<Record<string, string>>;
  body?: string;
  credentials: "omit";
  redirect: "error" | "manual";
  signal?: AbortSignal;
}>;

export type MediaHttpTransport = Readonly<{
  fetch: (
    url: string,
    init: MediaHttpRequestInit,
  ) => Promise<MediaHttpResponse>;
}>;

export class MediaOriginError extends Error {
  constructor(readonly reason: "malformed" | "mismatch") {
    super("invalid_media_origin_url");
  }
}

/**
 * Validates a candidate signed/redirect URL (MD1's put.url, MD5's Location)
 * against the configured media origin: same HTTPS origin, no userinfo, no
 * fragment. Returns nothing — callers keep using the original `candidate`
 * string verbatim so signed query bytes are never re-encoded or dropped.
 */
export function requireMediaOriginUrl(
  candidate: string,
  mediaOrigin: string,
): void {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new MediaOriginError("malformed");
  }
  if (
    parsed.origin !== mediaOrigin ||
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new MediaOriginError("mismatch");
  }
}
