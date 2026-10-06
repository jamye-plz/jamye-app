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
    "expo-sqlite",
    "expo-font",
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

const DEVELOPMENT_IDENTITY = {
  name: "Jamye Development",
  slug: "jamye-app",
  iosBundleIdentifier: "dev.local.jamyeapp",
  androidPackage: "dev.local.jamyeapp",
};

// A5/C17: APP_VARIANT=production identity. slug stays "jamye-app" (same EAS
// project as development); only the bundle id/package and display name
// change.
const PRODUCTION_IDENTITY = {
  name: "잼얘좀",
  slug: "jamye-app",
  iosBundleIdentifier: "com.ridewithmin.jamyeapp",
  androidPackage: "com.ridewithmin.jamyeapp",
};

const DEV_CLIENT_PLUGIN = ["expo-dev-client", { addGeneratedScheme: true }];
// C17a: prebuild auto-applies installed expo-dev-client as a legacy plugin
// regardless of whether app.config.ts lists it (addGeneratedScheme defaults
// to true there), so production must list it explicitly with the scheme
// generator turned off instead of omitting it.
const PRODUCTION_DEV_CLIENT_PLUGIN = [
  "expo-dev-client",
  { addGeneratedScheme: false },
];
const OAUTH_NATIVE_PLUGINS = ["expo-web-browser", "expo-secure-store"];
const MEDIA_PICKER_PLUGIN = [
  "expo-image-picker",
  {
    photosPermission: "선택한 사진과 동영상을 대화에 첨부하기 위해 접근합니다.",
    cameraPermission: false,
  },
];
const AUDIO_PLUGIN = [
  "expo-audio",
  {
    microphonePermission:
      "대화방에서 음성 메시지를 녹음하기 위해 마이크를 사용합니다.",
    enableBackgroundRecording: false,
    enableBackgroundPlayback: false,
  },
];
const IOS_APPLE_TEAM_ID = "6ZH8V43A7D";
const IOS_ASSOCIATED_DOMAINS = [
  "applinks:jamye-api.ridewithmin.com",
  "applinks:jamye-api.ridewithmin.com?mode=developer",
];
// C17: production drops the `?mode=developer` development-signing entry.
const PRODUCTION_IOS_ASSOCIATED_DOMAINS = [
  "applinks:jamye-api.ridewithmin.com",
];
const ANDROID_INTENT_FILTERS = [
  {
    action: "VIEW",
    autoVerify: true,
    data: [
      {
        scheme: "https",
        host: "jamye-api.ridewithmin.com",
        pathPrefix: "/invite",
      },
    ],
    category: ["BROWSABLE", "DEFAULT"],
  },
];
// M12: Expo push wiring (EAS project link, FCM V1 config, notifications plugin).
const PUSH_NOTIFICATIONS_PLUGIN = "expo-notifications";
// C17: production pins the iOS aps-environment to production (the bare
// plugin above defaults to development, per expo-notifications'
// NotificationsPluginProps `mode` default).
const PRODUCTION_PUSH_NOTIFICATIONS_PLUGIN = [
  "expo-notifications",
  { mode: "production" },
];
const EAS_OWNER = "jamye-plz";
const EAS_PROJECT_ID = "6a27e581-0093-4e75-bd88-01be99fcdab5";
const ANDROID_GOOGLE_SERVICES_FILE = "./google-services.json";
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

  test("derives development from the complete base and adds only the approved identity, EAS link, and launcher/push plugins", () => {
    const base = loadBaseConfig();
    const resolved = resolveAppConfig("development");

    expect(resolved).toEqual({
      ...base,
      name: DEVELOPMENT_IDENTITY.name,
      slug: DEVELOPMENT_IDENTITY.slug,
      owner: EAS_OWNER,
      ios: {
        ...(base.ios as UnknownRecord),
        bundleIdentifier: DEVELOPMENT_IDENTITY.iosBundleIdentifier,
        appleTeamId: IOS_APPLE_TEAM_ID,
        associatedDomains: IOS_ASSOCIATED_DOMAINS,
        usesAppleSignIn: true,
      },
      android: {
        ...(base.android as UnknownRecord),
        package: DEVELOPMENT_IDENTITY.androidPackage,
        googleServicesFile: ANDROID_GOOGLE_SERVICES_FILE,
        intentFilters: ANDROID_INTENT_FILTERS,
      },
      scheme: "jamye",
      extra: {
        eas: { projectId: EAS_PROJECT_ID },
        appVariant: "development",
      },
      plugins: [
        ...(base.plugins as unknown[]),
        DEV_CLIENT_PLUGIN,
        ...OAUTH_NATIVE_PLUGINS,
        MEDIA_PICKER_PLUGIN,
        AUDIO_PLUGIN,
        PUSH_NOTIFICATIONS_PLUGIN,
      ],
    });
    expect(resolved).toMatchObject({
      name: DEVELOPMENT_IDENTITY.name,
      slug: DEVELOPMENT_IDENTITY.slug,
      ios: {
        bundleIdentifier: DEVELOPMENT_IDENTITY.iosBundleIdentifier,
        appleTeamId: IOS_APPLE_TEAM_ID,
        associatedDomains: IOS_ASSOCIATED_DOMAINS,
        usesAppleSignIn: true,
      },
      android: {
        package: DEVELOPMENT_IDENTITY.androidPackage,
        intentFilters: ANDROID_INTENT_FILTERS,
      },
    });
    expect(resolved.scheme).toBe("jamye");
    expect(resolved.plugins).toEqual([
      ...PINNED_BASE.plugins,
      DEV_CLIENT_PLUGIN,
      ...OAUTH_NATIVE_PLUGINS,
      MEDIA_PICKER_PLUGIN,
      AUDIO_PLUGIN,
      PUSH_NOTIFICATIONS_PLUGIN,
    ]);
  });

  test("rejects a missing APP_VARIANT with an actionable error", () => {
    const missing = captureError(() => resolveAppConfig(undefined));
    expect(missing.message).toMatch(/APP_VARIANT/i);
    expect(missing.message).toMatch(/missing|required/i);
  });

  test("rejects an unknown APP_VARIANT with an actionable error naming the value", () => {
    const unknown = captureError(() => resolveAppConfig("staging"));
    expect(unknown.message).toMatch(/APP_VARIANT/i);
    expect(unknown.message).toMatch(/unsupported|unknown/i);
    expect(unknown.message).toMatch(/staging/i);
  });

  // PROD-AC6: preview stays unconfigured. The message is pinned exactly so a
  // future production-path change cannot silently also change preview's.
  test("rejects APP_VARIANT=preview with its existing not-configured error (PROD-AC6)", () => {
    const preview = captureError(() => resolveAppConfig("preview"));
    expect(preview.message).toBe(
      "APP_VARIANT=preview is not configured. No development identity fallback is available.",
    );
  });

  // PROD-AC1/AC2/AC3: production now resolves instead of throwing, with the
  // approved identity and the production-only plugin/domain differences.
  // C17a: the dev-client plugin stays explicit (not omitted) so its own
  // addGeneratedScheme: false overrides prebuild's legacy auto-plugin
  // default of true.
  test("derives production from the complete base and adds the approved production identity, EAS link, a scheme-disabled dev-client plugin, and the production push plugin", () => {
    const base = loadBaseConfig();
    const resolved = resolveAppConfig("production");

    expect(resolved).toEqual({
      ...base,
      name: PRODUCTION_IDENTITY.name,
      slug: PRODUCTION_IDENTITY.slug,
      owner: EAS_OWNER,
      ios: {
        ...(base.ios as UnknownRecord),
        bundleIdentifier: PRODUCTION_IDENTITY.iosBundleIdentifier,
        appleTeamId: IOS_APPLE_TEAM_ID,
        associatedDomains: PRODUCTION_IOS_ASSOCIATED_DOMAINS,
        usesAppleSignIn: true,
      },
      android: {
        ...(base.android as UnknownRecord),
        package: PRODUCTION_IDENTITY.androidPackage,
        googleServicesFile: ANDROID_GOOGLE_SERVICES_FILE,
        intentFilters: ANDROID_INTENT_FILTERS,
      },
      scheme: "jamye",
      extra: {
        eas: { projectId: EAS_PROJECT_ID },
        appVariant: "production",
      },
      plugins: [
        ...(base.plugins as unknown[]),
        PRODUCTION_DEV_CLIENT_PLUGIN,
        ...OAUTH_NATIVE_PLUGINS,
        MEDIA_PICKER_PLUGIN,
        AUDIO_PLUGIN,
        PRODUCTION_PUSH_NOTIFICATIONS_PLUGIN,
      ],
    });
    expect(resolved).toMatchObject({
      name: PRODUCTION_IDENTITY.name,
      slug: PRODUCTION_IDENTITY.slug,
      ios: {
        bundleIdentifier: PRODUCTION_IDENTITY.iosBundleIdentifier,
        appleTeamId: IOS_APPLE_TEAM_ID,
        associatedDomains: PRODUCTION_IOS_ASSOCIATED_DOMAINS,
        usesAppleSignIn: true,
      },
      android: {
        package: PRODUCTION_IDENTITY.androidPackage,
        intentFilters: ANDROID_INTENT_FILTERS,
      },
    });
    expect(resolved.scheme).toBe("jamye");
    expect(resolved.plugins).toEqual([
      ...PINNED_BASE.plugins,
      PRODUCTION_DEV_CLIENT_PLUGIN,
      ...OAUTH_NATIVE_PLUGINS,
      MEDIA_PICKER_PLUGIN,
      AUDIO_PLUGIN,
      PRODUCTION_PUSH_NOTIFICATIONS_PLUGIN,
    ]);
    // C17a: the plain development dev-client plugin (addGeneratedScheme:
    // true) must not appear, and the scheme-disabled production entry must.
    expect(resolved.plugins).not.toContainEqual(DEV_CLIENT_PLUGIN);
    expect(resolved.plugins).toContainEqual(PRODUCTION_DEV_CLIENT_PLUGIN);
    // C17a: defensive scan — no plugin entry anywhere in production may
    // generate a dev scheme, in case a future plugin addition reintroduces
    // one.
    const pluginsWithGeneratedSchemeEnabled = (
      resolved.plugins as unknown[]
    ).filter((plugin) => {
      if (!Array.isArray(plugin)) return false;
      const [, options] = plugin as [unknown, unknown];
      return isRecord(options) && options.addGeneratedScheme === true;
    });
    expect(pluginsWithGeneratedSchemeEnabled).toEqual([]);
  });
});
