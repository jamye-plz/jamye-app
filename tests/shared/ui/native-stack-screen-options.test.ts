import {
  resolveNativeStackScreenOptions,
  resolveNavigationTheme,
} from "@/shared/ui/native-stack-screen-options";
import { androidThemeColors, darkTheme, lightTheme } from "@/core/theme/tokens";

// expo-router's root entry pulls the whole router in; only the two theme
// objects matter here.
jest.mock("expo-router", () => ({
  DarkTheme: {
    colors: {
      background: "rgb(1, 1, 1)",
      card: "rgb(18, 18, 18)",
      text: "rgb(229, 229, 231)",
    },
    dark: true,
  },
  DefaultTheme: {
    colors: {
      background: "rgb(242, 242, 242)",
      card: "rgb(255, 255, 255)",
      text: "rgb(28, 28, 30)",
    },
    dark: false,
  },
}));

describe("resolveNativeStackScreenOptions", () => {
  test("keeps Berry tint for header buttons and a platform-neutral title color", () => {
    const light = lightTheme;
    const options = resolveNativeStackScreenOptions({
      colorScheme: "light",
      colors: light.colors,
      os: "ios",
    });
    expect(options.headerTintColor).toBe(light.colors.text);
    expect(options.headerTitleStyle).toEqual({ color: "#000000" });
    expect(options.headerLargeTitleStyle).toEqual({ color: "#000000" });
    expect(options.headerShadowVisible).toBe(false);
    expect(options.headerBackButtonDisplayMode).toBe("minimal");
    expect(options).not.toHaveProperty("headerStyle");
  });

  test("uses a white title in dark mode and paints the Android app bar with the canvas color", () => {
    const dark = darkTheme;
    const options = resolveNativeStackScreenOptions({
      colorScheme: "dark",
      colors: dark.colors,
      os: "android",
    });
    expect(options.headerTitleStyle).toEqual({ color: "#FFFFFF" });
    expect(options.headerStyle).toEqual({
      backgroundColor: dark.colors.background,
    });
    expect(options.contentStyle).toEqual({
      backgroundColor: dark.colors.background,
    });
  });
});

describe("resolveNavigationTheme", () => {
  test("follows the scheme and paints react-navigation's canvas with the iOS system background", () => {
    const dark = resolveNavigationTheme("dark", "ios");
    expect(dark.dark).toBe(true);
    expect(dark.colors.card).toBe("#000000");
    expect(dark.colors.background).toBe("#000000");
    expect(dark.colors.text).toBe("rgb(229, 229, 231)");
    const light = resolveNavigationTheme("light", "ios");
    expect(light.dark).toBe(false);
    expect(light.colors.card).toBe("#FFFFFF");
  });

  test("uses the fixed Berry-seeded Material canvas on Android", () => {
    expect(resolveNavigationTheme("dark", "android").colors.card).toBe(
      androidThemeColors("dark").background,
    );
    expect(resolveNavigationTheme("light", "android").colors.background).toBe(
      androidThemeColors("light").background,
    );
  });
});
