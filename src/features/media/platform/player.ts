/**
 * `tsc`-resolution fallback only. Metro/Jest always prefer the platform-
 * suffixed `player.ios.ts` / `player.android.ts` (this project's native-
 * module-wrapper convention). tsconfig has no `moduleSuffixes`, so a bare
 * `@/features/media/platform/player` import (used from
 * `voice-message-bubble.tsx`) only type-checks through `tsc` if a
 * non-suffixed `player.ts` exists alongside the two platform files -- the
 * same pattern task-app-account used for its own platform-split screens
 * (see `src/features/account/ui/nickname-edit-screen.tsx`). Re-exports the
 * iOS implementation verbatim; this file's own body never actually runs on
 * a device.
 */
export * from "./player.ios";
