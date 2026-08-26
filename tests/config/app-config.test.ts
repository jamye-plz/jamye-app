type UnknownRecord = Record<string, unknown>;
type AppConfigFactory = (context: { config: UnknownRecord }) => unknown;

const PINNED_BASE = {
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  ios: { icon: "./assets/expo.icon" },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: { output: "static", favicon: "./assets/images/favicon.png" },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

const DEVELOPMENT_IDENTITY = {
  name: "Jamye Development",
  slug: "jamye-development",
  iosBundleIdentifier: "dev.local.jamyeapp",
  androidPackage: "dev.local.jamyeapp",
};

const DEV_CLIENT_PLUGIN = ["expo-dev-client", { addGeneratedScheme: true }];
const INITIAL_APP_VARIANT = process.env.APP_VARIANT;
const INITIAL_PUBLIC_APP_MODE = process.env.EXPO_PUBLIC_APP_MODE;

function isRecord(value: unknown): value is UnknownRecord {
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

function loadRequiredModule<T>(
  modulePath: string,
  implementationPath: string,
): T {
  try {
    return jest.requireActual(modulePath) as T;
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        `M3-I1 implementation missing: ${implementationPath} and its required dependencies must exist before GREEN.`,
      );
    }
    throw error;
  }
}

function loadBaseConfig(): UnknownRecord {
  const value = loadRequiredModule<unknown>(
    "../../src/core/config/expo-base-config.json",
    "src/core/config/expo-base-config.json",
  );
  if (!isRecord(value)) {
    throw new Error(
      "M3-I1 implementation incomplete: expo-base-config.json must export one JSON object.",
    );
  }
  return value;
}

function resolveAppConfig(variant: string | undefined): UnknownRecord {
  if (variant === undefined) {
    delete process.env.APP_VARIANT;
  } else {
    process.env.APP_VARIANT = variant;
  }
  process.env.EXPO_PUBLIC_APP_MODE = "local-fixture";
  jest.resetModules();

  const loaded = loadRequiredModule<unknown>(
    "../../app.config",
    "app.config.ts",
  );
  const exported =
    isRecord(loaded) && "default" in loaded ? loaded.default : loaded;
  const resolved =
    typeof exported === "function"
      ? (exported as AppConfigFactory)({ config: {} })
      : exported;

  if (!isRecord(resolved)) {
    throw new Error(
      "M3-I1 implementation incomplete: app.config.ts must resolve synchronously to an Expo config object.",
    );
  }
  return resolved;
}

function captureError(operation: () => unknown): Error {
  try {
    operation();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error(
    "Expected strict APP_VARIANT validation to reject this configuration.",
  );
}

afterEach(() => {
  if (INITIAL_APP_VARIANT === undefined) {
    delete process.env.APP_VARIANT;
  } else {
    process.env.APP_VARIANT = INITIAL_APP_VARIANT;
  }
  if (INITIAL_PUBLIC_APP_MODE === undefined) {
    delete process.env.EXPO_PUBLIC_APP_MODE;
  } else {
    process.env.EXPO_PUBLIC_APP_MODE = INITIAL_PUBLIC_APP_MODE;
  }
  jest.resetModules();
});

describe("M3-I1 Expo configuration contract", () => {
  test("uses app.config.ts as the sole Expo manifest and keeps the base JSON as a fragment", () => {
    const { existsSync } = jest.requireActual("node:fs") as {
      existsSync: (path: string) => boolean;
    };

    expect({
      appConfigTs: existsSync(`${process.cwd()}/app.config.ts`),
      legacyAppJson: existsSync(`${process.cwd()}/app.json`),
      baseFragment: existsSync(
        `${process.cwd()}/src/core/config/expo-base-config.json`,
      ),
    }).toEqual({
      appConfigTs: true,
      legacyAppJson: false,
      baseFragment: true,
    });
  });

  test("keeps .env.example limited to the approved public local-fixture contract", () => {
    const { existsSync, readFileSync } = jest.requireActual("node:fs") as {
      existsSync: (path: string) => boolean;
      readFileSync: (path: string, encoding: "utf8") => string;
    };
    const envExamplePath = `${process.cwd()}/.env.example`;

    expect(existsSync(envExamplePath)).toBe(true);

    const lines = readFileSync(envExamplePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim());
    const assignments = lines.filter(
      (line) => line !== "" && !line.startsWith("#"),
    );
    const warning = lines.filter((line) => line.startsWith("#")).join(" ");

    expect(assignments).toEqual([
      "APP_VARIANT=development",
      "EXPO_PUBLIC_APP_MODE=local-fixture",
    ]);
    expect(warning).toMatch(/EXPO_PUBLIC_\*/);
    expect(warning).toMatch(/embedded.*app bundle/i);
    expect(warning).toMatch(/never secrets?/i);
    expect(warning).toMatch(/tokens?/i);
    expect(warning).toMatch(/credentials?/i);
    expect(warning).toMatch(/private endpoints?/i);
    expect(warning).toMatch(/user data/i);
  });

  test("pins every preserved Expo SDK 57 base value in the imported JSON SSOT", () => {
    expect(loadBaseConfig()).toEqual(PINNED_BASE);
  });

  test("derives development from the complete base and adds only the approved identity and launcher plugin", () => {
    const base = loadBaseConfig();
    const resolved = resolveAppConfig("development");

    expect(resolved).toEqual({
      ...base,
      name: DEVELOPMENT_IDENTITY.name,
      slug: DEVELOPMENT_IDENTITY.slug,
      ios: {
        ...(base.ios as UnknownRecord),
        bundleIdentifier: DEVELOPMENT_IDENTITY.iosBundleIdentifier,
      },
      android: {
        ...(base.android as UnknownRecord),
        package: DEVELOPMENT_IDENTITY.androidPackage,
      },
      plugins: [...(base.plugins as unknown[]), DEV_CLIENT_PLUGIN],
    });
    expect(resolved).toMatchObject({
      name: DEVELOPMENT_IDENTITY.name,
      slug: DEVELOPMENT_IDENTITY.slug,
      ios: { bundleIdentifier: DEVELOPMENT_IDENTITY.iosBundleIdentifier },
      android: { package: DEVELOPMENT_IDENTITY.androidPackage },
    });
    expect(resolved).not.toHaveProperty("scheme");
    expect(resolved.plugins).toEqual([
      ...PINNED_BASE.plugins,
      DEV_CLIENT_PLUGIN,
    ]);
  });

  test("rejects missing, unknown, preview, and production variants with distinct actionable errors", () => {
    const missing = captureError(() => resolveAppConfig(undefined));
    const unknown = captureError(() => resolveAppConfig("staging"));
    const preview = captureError(() => resolveAppConfig("preview"));
    const production = captureError(() => resolveAppConfig("production"));

    expect(missing.message).toMatch(/APP_VARIANT/i);
    expect(missing.message).toMatch(/missing|required/i);
    expect(unknown.message).toMatch(/APP_VARIANT/i);
    expect(unknown.message).toMatch(/unsupported|unknown/i);
    expect(unknown.message).toMatch(/staging/i);
    expect(preview.message).toMatch(/preview/i);
    expect(preview.message).toMatch(/not configured/i);
    expect(production.message).toMatch(/production/i);
    expect(production.message).toMatch(/not configured/i);
    expect(
      new Set([
        missing.message,
        unknown.message,
        preview.message,
        production.message,
      ]).size,
    ).toBe(4);
  });
});
