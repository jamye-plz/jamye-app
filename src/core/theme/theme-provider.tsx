import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";
import { useColorScheme } from "react-native";

import { resolveSystemTheme, type AppTheme } from "@/core/theme/tokens";

const AppThemeContext = createContext<AppTheme | undefined>(undefined);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const theme = resolveSystemTheme(useColorScheme());

  return (
    <AppThemeContext.Provider value={theme}>
      {children}
    </AppThemeContext.Provider>
  );
}

/**
 * Theme for surfaces that may mount outside `AppThemeProvider` (the root error
 * boundary fallback renders above every provider). Falls back to the system
 * color scheme instead of throwing.
 */
export function useAppThemeOrSystem(): AppTheme {
  const theme = useContext(AppThemeContext);
  const systemTheme = resolveSystemTheme(useColorScheme());
  return theme ?? systemTheme;
}

export function useAppTheme(): AppTheme {
  const theme = useContext(AppThemeContext);
  if (theme === undefined) {
    throw new Error("useAppTheme must be used inside AppThemeProvider.");
  }
  return theme;
}
