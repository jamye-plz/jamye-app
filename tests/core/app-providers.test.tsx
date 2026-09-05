import { render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";
import { Text, useColorScheme } from "react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("react-native-keyboard-controller", () => {
  const mockReact = jest.requireActual<typeof import("react")>("react");

  return {
    KeyboardProvider: ({ children }: { children: unknown }) =>
      mockReact.createElement(mockReact.Fragment, null, children as never),
  };
});

type AppTheme = Readonly<{
  colorScheme: "light" | "dark";
  colors: Readonly<{
    background: string;
    text: string;
  }>;
}>;
type ClockPort = Readonly<{ nowMs: () => number }>;
type MessageIdentityPort = Readonly<{
  next: () => Readonly<{ clientMsgId: string; localId: string }>;
}>;
type DatabaseRepository = Readonly<{
  ensureFixtureConversation: (fixture: unknown) => Promise<void>;
  label: string;
}>;
type DatabaseResource = Readonly<{
  close: () => Promise<void>;
  repository: DatabaseRepository;
}>;
type DatabaseProviderFactory = () => Promise<DatabaseResource>;
type FileSystemModule = Readonly<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>;
type AppRuntimeDependencies = Readonly<{
  clock: ClockPort;
  messageIdentity: MessageIdentityPort;
  repository: DatabaseRepository;
}>;
type AppProvidersProps = Readonly<{
  children: ReactNode;
  clockFactory?: () => ClockPort;
  databaseFactory?: DatabaseProviderFactory;
  messageIdentityFactory?: () => MessageIdentityPort;
}>;
type ProvidersModule = {
  AppProviders?: unknown;
  useAppRuntime?: unknown;
};
type ThemeModule = { useAppTheme?: unknown };
type UseAppTheme = () => AppTheme;
type UseAppRuntime = () => AppRuntimeDependencies;

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
  useAppRuntime: UseAppRuntime;
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
  if (typeof providers.useAppRuntime !== "function") {
    throw new Error(
      "M5-RUNTIME-1 implementation incomplete: app-providers.tsx must export useAppRuntime().",
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
    useAppRuntime: providers.useAppRuntime as UseAppRuntime,
  };
}

function createDeterministicDatabaseFactory(
  label: string,
): DatabaseProviderFactory {
  return jest.fn(async (): Promise<DatabaseResource> => ({
    close: async () => undefined,
    repository: {
      ensureFixtureConversation: async () => undefined,
      label,
    },
  }));
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
      const databaseFactory = createDeterministicDatabaseFactory(
        `theme-${colorScheme}`,
      );
      const clockFactory = jest.fn((): ClockPort => ({ nowMs: () => 1 }));
      const messageIdentityFactory = jest.fn((): MessageIdentityPort => ({
        next: () => ({ clientMsgId: "theme-client", localId: "theme-local" }),
      }));

      function ThemeProbe(): React.JSX.Element {
        const theme = useAppTheme();
        return (
          <Text>
            {theme.colorScheme}:{theme.colors.background}:{theme.colors.text}
          </Text>
        );
      }

      const screen = await render(
        <AppProviders
          clockFactory={clockFactory}
          databaseFactory={databaseFactory}
          messageIdentityFactory={messageIdentityFactory}
        >
          <ThemeProbe />
        </AppProviders>,
      );

      expect(
        await screen.findByText(`${colorScheme}:${background}:${text}`),
      ).toBeTruthy();
    },
  );
});

describe("M5-RUNTIME-1 AppProviders runtime dependency contract", () => {
  test("publishes the exact injected repository, clock, and identity once after one successful database attempt", async () => {
    const repository: DatabaseRepository = {
      ensureFixtureConversation: async () => undefined,
      label: "injected-repository",
    };
    const close = jest.fn(async () => undefined);
    const databaseFactory = jest.fn(async (): Promise<DatabaseResource> => ({
      close,
      repository,
    }));
    const clock: ClockPort = { nowMs: () => 3456 };
    const messageIdentity: MessageIdentityPort = {
      next: () => ({
        clientMsgId: "client-message-1",
        localId: "local-message-1",
      }),
    };
    const clockFactory = jest.fn(() => clock);
    const messageIdentityFactory = jest.fn(() => messageIdentity);
    const { AppProviders, useAppRuntime } = loadProviderContract();

    function RuntimeProbe(): React.JSX.Element {
      const runtime = useAppRuntime();
      return (
        <Text>
          {runtime.repository.label}:{runtime.clock.nowMs()}:
          {runtime.messageIdentity.next().localId}
        </Text>
      );
    }

    const screen = await render(
      <AppProviders
        clockFactory={clockFactory}
        databaseFactory={databaseFactory}
        messageIdentityFactory={messageIdentityFactory}
      >
        <RuntimeProbe />
      </AppProviders>,
    );

    expect(
      await screen.findByText("injected-repository:3456:local-message-1"),
    ).toBeTruthy();
    expect(databaseFactory).toHaveBeenCalledTimes(1);
    expect(clockFactory).toHaveBeenCalledTimes(1);
    expect(messageIdentityFactory).toHaveBeenCalledTimes(1);

    await screen.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("uses the named production database, clock, and identity factories as defaults", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/core/providers/app-providers.tsx`,
      "utf8",
    );

    expect(source).toMatch(
      /import\s*\{[^}]*productionDatabaseFactory[^}]*\}\s*from\s*["'][^"']*database-provider["']/,
    );
    expect(source).toMatch(
      /import\s*\{[^}]*createSystemClock[^}]*\}\s*from\s*["'][^"']*chat-send["']/,
    );
    expect(source).toMatch(
      /import\s*\{[^}]*createMonotonicMessageIdentity[^}]*\}\s*from\s*["'][^"']*chat-send["']/,
    );
    expect(source).toMatch(/databaseFactory\s*=\s*productionDatabaseFactory/);
    expect(source).toMatch(/clockFactory\s*=\s*createSystemClock/);
    expect(source).toMatch(
      /messageIdentityFactory\s*=\s*createMonotonicMessageIdentity/,
    );
  });

  test("mounts the native keyboard controller above application consumers", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/core/providers/app-providers.tsx`,
      "utf8",
    );

    expect(source).toMatch(
      /import\s*\{[^}]*KeyboardProvider[^}]*\}\s*from\s*["']react-native-keyboard-controller["']/,
    );

    const keyboardProviderStart = source.indexOf("<KeyboardProvider>");
    const themeProviderStart = source.indexOf("<AppThemeProvider>");
    const keyboardProviderEnd = source.indexOf("</KeyboardProvider>");

    expect(keyboardProviderStart).toBeGreaterThan(-1);
    expect(keyboardProviderStart).toBeLessThan(themeProviderStart);
    expect(keyboardProviderEnd).toBeGreaterThan(themeProviderStart);
  });

  test("throws outside AppProviders instead of manufacturing a runtime fallback", async () => {
    const { useAppRuntime } = loadProviderContract();

    function OutsideProviderProbe(): React.JSX.Element {
      useAppRuntime();
      return <Text>unreachable</Text>;
    }

    await expect(render(<OutsideProviderProbe />)).rejects.toThrow(
      /useAppRuntime must be used inside AppProviders/i,
    );
  });
});
