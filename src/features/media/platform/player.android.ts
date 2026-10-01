/**
 * F3/C16: byte-identical to `player.ios.ts` -- Android shares the exact
 * same `expo-audio` player-hook wrapper as iOS (no platform divergence
 * exists today; see `player.ios.ts` for the full implementation and
 * rationale). Re-exports the iOS implementation instead of maintaining a
 * duplicate twin; split back into its own file if a genuine Android-only
 * tweak is ever needed.
 */
export * from "./player.ios";
