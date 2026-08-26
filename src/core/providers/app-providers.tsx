import type { PropsWithChildren } from "react";

import { getPublicEnv } from "@/core/config/public-env";
import { AppThemeProvider } from "@/core/theme/theme-provider";

export function AppProviders({ children }: PropsWithChildren) {
  getPublicEnv();
  return <AppThemeProvider>{children}</AppThemeProvider>;
}
