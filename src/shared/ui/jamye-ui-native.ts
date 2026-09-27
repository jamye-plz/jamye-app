import { requireNativeView } from "expo";
import type { ComponentType } from "react";

export type JamyeAvatarNativeViewProps = Readonly<{
  uri?: string;
  name: string;
  size: number;
  accentColorHex?: string;
  backgroundColorHex?: string;
  testID?: string;
}>;

export type JamyeDateChipRowItem = Readonly<{ key: string; label: string }>;

export type JamyeDateChipRowNativeViewProps = Readonly<{
  items: readonly JamyeDateChipRowItem[];
  selectedKey: string;
  onDateSelect?: (
    event: Readonly<{ nativeEvent: Readonly<{ key: string }> }>,
  ) => void;
  accentColorHex: string;
  surfaceColorHex?: string;
  testID?: string;
}>;

type RequireNativeView = typeof requireNativeView;

export type JamyeUiNativeViews = Readonly<{
  avatar: ComponentType<JamyeAvatarNativeViewProps> | null;
  dateChipRow: ComponentType<JamyeDateChipRowNativeViewProps> | null;
}>;

/**
 * Pure resolver, decoupled from reading `process.env.EXPO_OS` directly --
 * mirrors `src/core/theme/tokens.ts`'s `resolveThemeColorForOs`. Metro/babel
 * statically inlines every `process.env.EXPO_OS` occurrence per platform
 * bundle, and jest-expo always inlines it to the literal `"ios"`, so a test
 * can never observe the untaken branch by mutating the env var at runtime;
 * this function takes `os` as an explicit parameter so
 * `tests/shared/ui/jamye-ui-native.test.tsx` can exercise both branches.
 *
 * Each native view lives in the local `jamye-ui` Expo module (A1) and is
 * only registered on one platform (`JamyeAvatarView` on iOS,
 * `JamyeDateChipRowView` on Android), so the untaken branch must never call
 * `requireNativeView` at all -- looking up an unregistered view name throws.
 */
export function resolveJamyeUiNativeViews(
  os: string | undefined,
  requireView: RequireNativeView,
): JamyeUiNativeViews {
  return {
    avatar:
      os === "ios"
        ? (requireView(
            "JamyeUi",
            "JamyeAvatarView",
          ) as ComponentType<JamyeAvatarNativeViewProps>)
        : null,
    dateChipRow:
      os === "android"
        ? (requireView(
            "JamyeUi",
            "JamyeDateChipRowView",
          ) as ComponentType<JamyeDateChipRowNativeViewProps>)
        : null,
  };
}

// Sole real runtime read of process.env.EXPO_OS; Metro inlines/dead-code-
// eliminates this per platform bundle the same way tokens.ts's
// buildThemeColors call site does. Resolved eagerly at module scope, the
// same way every other expo-ui view binding in this SDK works (e.g.
// node_modules/@expo/ui/src/swift-ui/Image/index.tsx's top-level
// `requireNativeView('ExpoUI', 'ImageView')`): each view above is only ever
// registered on one platform, so the untaken branch's `requireNativeView`
// call never runs, and importing this file on the other platform (or under
// jest, which always resolves EXPO_OS to "ios") never crashes. Consumers
// that need to unit-test against a specific os/view combination should mock
// this module directly (see tests/shared/ui/avatar.ios.test.tsx) rather than
// mocking "expo" -- `resolveJamyeUiNativeViews` above is the unit under test
// for the os-branch logic itself (tests/shared/ui/jamye-ui-native.test.tsx).
const jamyeUiNativeViews = resolveJamyeUiNativeViews(
  process.env.EXPO_OS,
  requireNativeView,
);

export const JamyeAvatarNativeView = jamyeUiNativeViews.avatar;
export const JamyeDateChipRowNativeView = jamyeUiNativeViews.dateChipRow;
