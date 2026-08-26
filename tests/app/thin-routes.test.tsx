import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";

let mockRouterShouldThrow = false;

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

jest.mock("expo-router", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  function Stack(): React.JSX.Element {
    if (mockRouterShouldThrow) {
      throw new Error("router-render-failure");
    }
    const theme = jest.requireActual<{
      useAppTheme: () => { colorScheme: "light" | "dark" };
    }>("../../src/core/theme/theme-provider");
    const { colorScheme } = theme.useAppTheme();

    return (
      <View
        accessibilityLabel={`Expo Router stack ${colorScheme}`}
        testID="expo-router-stack"
      />
    );
  }

  return { Stack };
});

type DefaultComponentModule = { default?: unknown };
type NamedComponentModule = Record<string, unknown>;
type AppProvidersProps = { children: ReactNode };

const REQUIRED_NOTICE =
  "로컬 개발용 fixture 데이터입니다. production server에 연결되어 있지 않습니다.";

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

function requireShellDependencies(): void {
  const dependencies = [
    [
      "../../src/core/errors/app-error-boundary",
      "src/core/errors/app-error-boundary.tsx",
      "AppErrorBoundary",
    ],
    [
      "../../src/core/providers/app-providers",
      "src/core/providers/app-providers.tsx",
      "AppProviders",
    ],
    [
      "../../src/core/theme/theme-provider",
      "src/core/theme/theme-provider.tsx",
      "useAppTheme",
    ],
    [
      "../../src/features/development-fixture/ui/development-fixture-screen",
      "src/features/development-fixture/ui/development-fixture-screen.tsx",
      "DevelopmentFixtureScreen",
    ],
  ] as const;

  for (const [modulePath, implementationPath, exportName] of dependencies) {
    const loaded = loadRequiredModule<NamedComponentModule>(
      modulePath,
      implementationPath,
    );
    if (typeof loaded[exportName] !== "function") {
      throw new Error(
        `M3-I3 implementation incomplete: ${implementationPath} must export ${exportName}.`,
      );
    }
  }
}

function loadActualRoute(
  modulePath: string,
  implementationPath: string,
): ComponentType {
  requireShellDependencies();
  const loaded = loadRequiredModule<DefaultComponentModule>(
    modulePath,
    implementationPath,
  );
  if (typeof loaded.default !== "function") {
    throw new Error(
      `M3-I3 implementation incomplete: ${implementationPath} must default-export its actual route component.`,
    );
  }
  return loaded.default as ComponentType;
}

function loadActualAppProviders(): ComponentType<AppProvidersProps> {
  const loaded = loadRequiredModule<NamedComponentModule>(
    "../../src/core/providers/app-providers",
    "src/core/providers/app-providers.tsx",
  );
  if (typeof loaded.AppProviders !== "function") {
    throw new Error(
      "M3-I3 implementation incomplete: app-providers.tsx must export AppProviders.",
    );
  }
  return loaded.AppProviders as ComponentType<AppProvidersProps>;
}

let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  mockRouterShouldThrow = false;
  consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("M3-I3 actual thin Expo Router modules", () => {
  test("renders the actual root layout with the active theme provider around Expo Router", async () => {
    const RootLayout = loadActualRoute(
      "../../src/app/_layout",
      "src/app/_layout.tsx",
    );
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("expo-router-stack")).toBeTruthy();
    expect(screen.getByLabelText("Expo Router stack light")).toBeTruthy();
  });

  test("keeps the actual root Error Boundary outside the Router and recovers on retry", async () => {
    const RootLayout = loadActualRoute(
      "../../src/app/_layout",
      "src/app/_layout.tsx",
    );
    mockRouterShouldThrow = true;
    const screen = await render(<RootLayout />);

    expect(screen.getByRole("alert")).toBeTruthy();

    mockRouterShouldThrow = false;
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.getByLabelText("Expo Router stack light")).toBeTruthy();
  });

  test("renders the actual index route and its exact local fixture notice", async () => {
    const IndexRoute = loadActualRoute(
      "../../src/app/index",
      "src/app/index.tsx",
    );
    const AppProviders = loadActualAppProviders();
    const screen = await render(
      <AppProviders>
        <IndexRoute />
      </AppProviders>,
    );

    expect(screen.getByText(REQUIRED_NOTICE)).toBeTruthy();
  });
});
