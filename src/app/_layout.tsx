import { Stack } from "expo-router";

import { AppErrorBoundary } from "@/core/errors/app-error-boundary";
import { AppProviders } from "@/core/providers/app-providers";
import { useNativeStackScreenOptions } from "@/shared/ui/native-stack-screen-options";

/**
 * Themed root Stack. `AppThemeProvider` lives inside `AppProviders`, so this
 * inner component reads the theme at render time instead of hoisting the
 * `Stack` into `RootLayout` directly. The `(tabs)` group owns the top-level
 * tab bar (ADR 0009); chat and the create/join/new-topic modals stay here so
 * the tab bar is hidden while they are open.
 */
function RootStack() {
  const screenOptions = useNativeStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
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
