/**
 * F3/C16: byte-identical to `recorder.ios.ts` -- expo-audio abstracts the
 * native recording session itself, so Android shares the exact same
 * wrapper as iOS (no platform divergence exists today; see
 * `recorder.ios.ts` for the full implementation and rationale). Re-exports
 * the iOS implementation instead of maintaining a duplicate twin; split
 * back into its own file if a genuine Android-only tweak is ever needed.
 */
export * from "./recorder.ios";
