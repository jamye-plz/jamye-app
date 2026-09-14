import { fetch as expoFetch } from "expo/fetch";

import type { MediaHttpTransport } from "@/features/media/data/media-transport";

/**
 * Native `MediaHttpTransport` implementation for `createMediaApi` (core/data). Uses
 * `expo/fetch` explicitly — never the RN global `fetch` — because only the native Expo
 * fetch implementation exposes `credentials: "omit"` and `redirect: "manual"` per the
 * approved M11 transport decision (plan-20260910-225702.json `architecture.transport`).
 *
 * Native capability (readable MD5 307 Location, true cookie/bearer isolation, bounded
 * memory on real devices) is NOT verified by this source — no build/runtime session was
 * authorized for this task. Treat this file as unproven until an explicitly approved
 * native run checks it.
 */
export function createNativeMediaHttpTransport(): MediaHttpTransport {
  return {
    async fetch(url, init) {
      const response = await expoFetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        credentials: init.credentials,
        redirect: init.redirect,
        signal: init.signal,
      });
      return {
        status: response.status,
        ok: response.ok,
        headers: { get: (name) => response.headers.get(name) },
        json: () => response.json(),
      };
    },
  };
}
