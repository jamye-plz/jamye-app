import { Stack } from "expo-router";

import { AppErrorBoundary } from "@/core/errors/app-error-boundary";
import { AppProviders } from "@/core/providers/app-providers";

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <Stack screenOptions={{ headerShown: false }} />
      </AppProviders>
    </AppErrorBoundary>
  );
}
