/**
 * `tsc`-resolution fallback only. Metro/Jest always prefer the platform-
 * suffixed `topic-media-carousel-row.android.tsx` / `.ios.tsx` (Android
 * hosts a Jetpack Compose carousel, iOS a plain RN ScrollView -- ADR 0010).
 * tsconfig has no `moduleSuffixes`, so a bare `./topic-media-carousel-row`
 * import (used from `topic-media-gallery.tsx`) only type-checks through
 * `tsc` if a non-suffixed file exists alongside the two platform files --
 * the same pattern `platform/player.ts` uses for its own iOS/Android split.
 * Re-exports the Android implementation verbatim; this file's own body
 * never actually runs on a device.
 */
export * from "./topic-media-carousel-row.android";
