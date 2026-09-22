import type { ColorValue } from "react-native";
import { PlatformColor } from "react-native";
import {
  androidThemeColors,
  darkTheme,
  lightTheme,
  resolveSystemTheme,
  resolveThemeColorForOs,
} from "../../../src/core/theme/tokens";

/**
 * `resolveThemeColorForOs` is exported as a pure function precisely so this
 * suite can exercise the ios/android/fallback branches directly: jest-expo's
 * babel transform inlines `process.env.EXPO_OS` to the literal "ios" for the
 * whole test bundle, so `buildThemeColors` itself can only ever be observed
 * on its iOS branch here.
 */
describe("resolveThemeColorForOs (pure branch coverage)", () => {
  const fallback = "#29252D";
  const androidHex = "#201A1C";

  test("returns PlatformColor(iosIdentifier) when os is 'ios'", () => {
    expect(
      resolveThemeColorForOs("ios", "label", androidHex, fallback),
    ).toEqual(PlatformColor("label"));
  });

  test("returns the Berry-seeded Material hex when os is 'android' (ADR 0011: no wallpaper dynamic color)", () => {
    expect(
      resolveThemeColorForOs("android", "label", androidHex, fallback),
    ).toBe(androidHex);
  });

  test("returns the exact hex fallback when os is undefined (web/Node/default)", () => {
    expect(
      resolveThemeColorForOs(undefined, "label", androidHex, fallback),
    ).toBe(fallback);
  });

  test("returns the exact hex fallback for an unrecognized os value", () => {
    expect(
      resolveThemeColorForOs("windows", "label", androidHex, fallback),
    ).toBe(fallback);
  });
});

describe("Android Berry-seeded Material 3 palette (ADR 0011)", () => {
  test("light and dark schemes expose plain hex roles generated from the Berry seed", () => {
    const light = androidThemeColors("light");
    const dark = androidThemeColors("dark");
    expect(light.background).toBe("#FFF8F8");
    expect(light.surface).toBe("#F7EBED");
    expect(light.text).toBe("#201A1C");
    expect(light.accentContainer).toBe("#FFD9E4");
    expect(dark.background).toBe("#120D0E");
    expect(dark.surface).toBe("#241E20");
    expect(dark.text).toBe("#EBE0E2");
    expect(dark.accentContainer).toBe("#5A3F49");
    for (const spec of [light, dark])
      for (const value of Object.values(spec))
        expect(value).toMatch(/^#[0-9A-F]{6}$/);
  });

  test("keeps the Berry accent literal in both Android schemes", () => {
    expect(androidThemeColors("light").primary).toBe("#9B3F68");
    expect(androidThemeColors("dark").primary).toBe("#E39BB8");
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
    expectSemantic(lightTheme.colors.accentContainer, "secondarySystemFill");
    expectSemantic(lightTheme.colors.onAccentContainer, "label");

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
