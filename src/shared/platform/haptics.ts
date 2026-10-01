// tsc bare-import fallback (same pattern as `src/features/media/platform/player.ts`):
// Metro/React Native resolve `.ios.ts`/`.android.ts` per platform; `tsc`
// does not, so a bare `@/shared/platform/haptics` import resolves here.
export * from "./haptics.ios";
