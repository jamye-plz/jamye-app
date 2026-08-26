import { render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";

type LocalDevelopmentFixture = Readonly<{
  id: "development-fixture";
  mode: "local-fixture";
  notice: typeof REQUIRED_NOTICE;
}>;
type FixtureModelModule = { LOCAL_DEVELOPMENT_FIXTURE?: unknown };
type FixtureScreenModule = { DevelopmentFixtureScreen?: unknown };
type ProvidersModule = { AppProviders?: unknown };
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

function loadFixtureContract(): {
  fixture: LocalDevelopmentFixture;
  DevelopmentFixtureScreen: ComponentType;
  AppProviders: ComponentType<AppProvidersProps>;
} {
  const model = loadRequiredModule<FixtureModelModule>(
    "../../src/features/development-fixture/model/local-fixture",
    "src/features/development-fixture/model/local-fixture.ts",
  );
  const screen = loadRequiredModule<FixtureScreenModule>(
    "../../src/features/development-fixture/ui/development-fixture-screen",
    "src/features/development-fixture/ui/development-fixture-screen.tsx",
  );
  const providers = loadRequiredModule<ProvidersModule>(
    "../../src/core/providers/app-providers",
    "src/core/providers/app-providers.tsx",
  );

  if (!isRecord(model.LOCAL_DEVELOPMENT_FIXTURE)) {
    throw new Error(
      "M3-I3 implementation incomplete: local-fixture.ts must export LOCAL_DEVELOPMENT_FIXTURE.",
    );
  }
  if (typeof screen.DevelopmentFixtureScreen !== "function") {
    throw new Error(
      "M3-I3 implementation incomplete: development-fixture-screen.tsx must export DevelopmentFixtureScreen.",
    );
  }
  if (typeof providers.AppProviders !== "function") {
    throw new Error(
      "M3-I3 implementation incomplete: app-providers.tsx must export AppProviders.",
    );
  }

  return {
    fixture: model.LOCAL_DEVELOPMENT_FIXTURE as LocalDevelopmentFixture,
    DevelopmentFixtureScreen: screen.DevelopmentFixtureScreen as ComponentType,
    AppProviders: providers.AppProviders as ComponentType<AppProvidersProps>,
  };
}

describe("M3-I3 deterministic local development fixture contract", () => {
  test("exports only the stable M3 fixture identity, mode, and notice", () => {
    const { fixture } = loadFixtureContract();

    expect(fixture).toEqual({
      id: "development-fixture",
      mode: "local-fixture",
      notice: REQUIRED_NOTICE,
    });
  });

  test("renders the exact local-only notice and mode through the actual feature screen", async () => {
    const { AppProviders, DevelopmentFixtureScreen } = loadFixtureContract();
    const screen = await render(
      <AppProviders>
        <DevelopmentFixtureScreen />
      </AppProviders>,
    );

    expect(screen.getByText(REQUIRED_NOTICE)).toBeTruthy();
    expect(screen.getByText(/local-fixture/)).toBeTruthy();
  });
});
