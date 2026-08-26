import { render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";
import { Text, useColorScheme } from "react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(),
}));

type AppTheme = Readonly<{
  colorScheme: "light" | "dark";
  colors: Readonly<{
    background: string;
    text: string;
  }>;
}>;
type AppProvidersProps = { children: ReactNode };
type ProvidersModule = { AppProviders?: unknown };
type ThemeModule = { useAppTheme?: unknown };
type UseAppTheme = () => AppTheme;

const EXPECTED_THEMES = [
  {
    colorScheme: "light" as const,
    background: "#FAF8F4",
    text: "#29252D",
  },
  {
    colorScheme: "dark" as const,
    background: "#1C1920",
    text: "#F4EEF2",
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error.code === "MODULE_NOT_FOUND" ||
    (typeof error.message === "string" &&
      error.message.includes("Cannot find module"))
  );
}

function loadRequiredModule<T extends object>(
  modulePath: string,
  implementationPath: string,
): T {
  try {
    return jest.requireActual<T>(modulePath);
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        `M3-I3 implementation missing: ${implementationPath} must exist before GREEN.`,
      );
    }
    throw error;
  }
}

function loadProviderContract(): {
  AppProviders: ComponentType<AppProvidersProps>;
  useAppTheme: UseAppTheme;
} {
  const providers = loadRequiredModule<ProvidersModule>(
    "../../src/core/providers/app-providers",
    "src/core/providers/app-providers.tsx",
  );
  const theme = loadRequiredModule<ThemeModule>(
    "../../src/core/theme/theme-provider",
    "src/core/theme/theme-provider.tsx",
  );

  if (typeof providers.AppProviders !== "function") {
    throw new Error(
      "M3-I3 implementation incomplete: app-providers.tsx must export AppProviders.",
    );
  }
  if (typeof theme.useAppTheme !== "function") {
    throw new Error(
      "M3-I3 implementation incomplete: theme-provider.tsx must export useAppTheme().",
    );
  }

  return {
    AppProviders: providers.AppProviders as ComponentType<AppProvidersProps>,
    useAppTheme: theme.useAppTheme as UseAppTheme,
  };
}

const mockedUseColorScheme = jest.mocked(useColorScheme);

afterEach(() => {
  mockedUseColorScheme.mockReset();
});

describe("M3-I3 active provider and system theme contract", () => {
  test.each(EXPECTED_THEMES)(
    "provides the semantic $colorScheme theme selected by useColorScheme",
    async ({ colorScheme, background, text }) => {
      mockedUseColorScheme.mockReturnValue(colorScheme);
      const { AppProviders, useAppTheme } = loadProviderContract();

      function ThemeProbe(): React.JSX.Element {
        const theme = useAppTheme();
        return (
          <Text>
            {theme.colorScheme}:{theme.colors.background}:{theme.colors.text}
          </Text>
        );
      }

      const screen = await render(
        <AppProviders>
          <ThemeProbe />
        </AppProviders>,
      );

      expect(
        screen.getByText(`${colorScheme}:${background}:${text}`),
      ).toBeTruthy();
    },
  );
});
