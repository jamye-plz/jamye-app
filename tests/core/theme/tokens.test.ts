import type { ColorValue } from "react-native";
import { PlatformColor } from "react-native";

import {
  androidSystemColor,
  darkTheme,
  lightTheme,
  resolveSystemTheme,
  resolveThemeColorForOs,
} from "../../../src/core/theme/tokens";

/**
 * `resolveThemeColorForOs` is exported as a pure function precisely so this
 * suite can exercise the ios/android/fallback branches directly: jest-expo's
 * babel transform always inlines `process.env.EXPO_OS` to a fixed "ios"
 * literal for every test file (see `jest-expo/src/resolveBabelOptions.js`'s
 * `caller: { platform: "ios" }`), so mutating `process.env.EXPO_OS` at test
 * runtime cannot flip the branch actually compiled into `tokens.ts`.
 */
describe("resolveThemeColorForOs (pure branch coverage)", () => {
  const identifiers = {
    ios: "label",
    android: "@android:color/system_on_surface_light",
  };
  const fallback = "#29252D";

  test("returns PlatformColor(identifiers.ios) when os is 'ios'", () => {
    expect(resolveThemeColorForOs("ios", identifiers, fallback)).toEqual(
      PlatformColor("label"),
    );
  });

  test("returns PlatformColor(identifiers.android) when os is 'android' on API 34+", () => {
    expect(
      resolveThemeColorForOs("android", identifiers, fallback, 34),
    ).toEqual(PlatformColor("@android:color/system_on_surface_light"));
  });

  test("keeps the hex fallback on Android below API 34 (no system Material roles)", () => {
    expect(resolveThemeColorForOs("android", identifiers, fallback, 33)).toBe(
      fallback,
    );
  });

  test("androidSystemColor builds scheme-suffixed system resource names", () => {
    expect(androidSystemColor("surface_container", "dark")).toBe(
      "@android:color/system_surface_container_dark",
    );
  });

  test("returns the exact hex fallback when os is undefined (web/Node/default)", () => {
    expect(resolveThemeColorForOs(undefined, identifiers, fallback)).toBe(
      fallback,
    );
  });

  test("returns the exact hex fallback for an unrecognized os value", () => {
    expect(resolveThemeColorForOs("windows", identifiers, fallback)).toBe(
      fallback,
    );
  });
});

describe("theme tokens platform semantic colors (D1-T1a)", () => {
  test("wires every iOS system-color identifier required by D2/D3 through the real env read", () => {
    // jest-expo inlines process.env.EXPO_OS to "ios" for this whole suite, so
    // the actual exported lightTheme/darkTheme constants are a genuine
    // end-to-end check that buildThemeColors really reads the env var and
    // calls PlatformColor with the identifiers native-ui-requirements-*.md
    // §3 lists, not just that the pure resolver above works in isolation.
    const expectSemantic = (value: ColorValue, name: string) =>
      expect(value).toEqual(PlatformColor(name));

    expectSemantic(lightTheme.colors.background, "systemBackground");
    expectSemantic(lightTheme.colors.surface, "secondarySystemBackground");
    expectSemantic(
      lightTheme.colors.groupedBackground,
      "systemGroupedBackground",
    );
    expectSemantic(
      lightTheme.colors.secondaryGroupedBackground,
      "secondarySystemGroupedBackground",
    );
    expectSemantic(lightTheme.colors.text, "label");
    expectSemantic(lightTheme.colors.textMuted, "secondaryLabel");
    expectSemantic(lightTheme.colors.textTertiary, "tertiaryLabel");
    expectSemantic(lightTheme.colors.border, "separator");
    expectSemantic(lightTheme.colors.divider, "separator");
    expectSemantic(lightTheme.colors.fill, "systemFill");
    expectSemantic(lightTheme.colors.placeholder, "placeholderText");
    expectSemantic(lightTheme.colors.error, "systemRed");

    // Dark theme resolves the same self-adapting iOS semantic identifiers;
    // only the Berry accent literals differ between schemes.
    expectSemantic(darkTheme.colors.background, "systemBackground");
    expectSemantic(darkTheme.colors.text, "label");
  });

  test("keeps the Berry accent as a literal brand hex, not a PlatformColor", () => {
    expect(lightTheme.colors.primary).toBe("#9B3F68");
    expect(lightTheme.colors.onPrimary).toBe("#FFFFFF");
    expect(darkTheme.colors.primary).toBe("#E39BB8");
    expect(darkTheme.colors.onPrimary).toBe("#2C141F");
  });

  test("keeps noticeSurface as a literal hex (no mandated system-color identifier)", () => {
    expect(lightTheme.colors.noticeSurface).toBe("#FBF3D6");
    expect(darkTheme.colors.noticeSurface).toBe("#3D351F");
  });

  test("resolveSystemTheme still selects dark only for the exact 'dark' colorScheme", () => {
    expect(resolveSystemTheme("dark")).toBe(darkTheme);
    expect(resolveSystemTheme("light")).toBe(lightTheme);
    expect(resolveSystemTheme(null)).toBe(lightTheme);
    expect(resolveSystemTheme(undefined)).toBe(lightTheme);
    expect(resolveSystemTheme("anything-else")).toBe(lightTheme);
  });
});
