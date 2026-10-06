import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * A11YM-AC1/AC2: tracks the system "reduce motion" accessibility setting,
 * including a mid-session toggle (Settings/Control Center) via
 * `AccessibilityInfo`'s `reduceMotionChanged` event. reanimated's own
 * `useReducedMotion` freezes the value read at app start and documents that
 * a later system change "doesn't cause your components to rerender"
 * (node_modules/react-native-reanimated/src/hook/useReducedMotion.ts), so it
 * cannot drive a live toggle during a device accessibility check.
 *
 * Starts `false` -- the pre-existing, always-animated behavior -- until the
 * async `isReduceMotionEnabled()` query resolves, so a cold start never
 * blocks on this read.
 */
export function useReduceMotionEnabled(): boolean {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotionEnabled(value);
      })
      .catch(() => {
        // Defensive only: a native rejection is not expected in practice.
        // Keeps the pre-existing always-animated default instead of an
        // unhandled rejection; it must never mask a broken test mock (a
        // mock that returns `undefined` instead of a Promise throws before
        // this `.catch` can even attach, which is what it should do).
      });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotionEnabled,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotionEnabled;
}

/** A11YM-AC2: duration (ms) of the image/poster cross-fade when motion is allowed. */
export const IMAGE_FADE_MS = 150;

/**
 * A11YM-AC2: the expo-image `transition` for a fading image -- `null` (no
 * fade) while the system "reduce motion" setting is on, `IMAGE_FADE_MS`
 * otherwise. Built on `useReduceMotionEnabled`, so it starts at the animated
 * default and follows a mid-session toggle.
 */
export function useImageFadeTransition(): number | null {
  return useReduceMotionEnabled() ? null : IMAGE_FADE_MS;
}
