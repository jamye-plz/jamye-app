import { Stack } from "expo-router";

import { AppErrorBoundary } from "@/core/errors/app-error-boundary";
import { AppProviders } from "@/core/providers/app-providers";
import { useAppTheme } from "@/core/theme/theme-provider";

/**
 * Themed root Stack. `AppThemeProvider` lives inside `AppProviders`, so this
 * inner component reads `useAppTheme()` at render time instead of hoisting
 * the `Stack` into `RootLayout` directly. Screens declare their own
 * `title`/`headerRight` later via `<Stack.Screen options={...} />`.
 */
function RootStack() {
  const { colorScheme, colors } = useAppTheme();
  // react-navigation applies headerTintColor to the title as well; keep the
  // Berry tint for buttons only and give titles the platform label color.
  const titleColor = colorScheme === "dark" ? "#FFFFFF" : "#000000";

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.primary,
        headerBackButtonDisplayMode: "minimal",
        headerShadowVisible: false,
        // Android's Material top app bar shares the surface color with the
        // content; iOS keeps the system header material (see PlatformColor note).
        ...(process.env.EXPO_OS === "android"
          ? { headerStyle: { backgroundColor: colors.background } }
          : {}),
        headerTitleStyle: { color: titleColor },
        headerLargeTitleStyle: { color: titleColor },
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <RootStack />
      </AppProviders>
    </AppErrorBoundary>
  );
}
