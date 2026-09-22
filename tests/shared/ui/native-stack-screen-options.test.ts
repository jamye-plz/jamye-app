import { resolveNativeStackScreenOptions } from "@/shared/ui/native-stack-screen-options";
import { darkTheme, lightTheme } from "@/core/theme/tokens";

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
