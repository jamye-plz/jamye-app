import {
  checkArchitecture,
  classifyTutorialAssetReferencesInText,
  isAuthorizedWorkingTreePath,
} from "../../tools/quality/check-architecture.cjs";

type Violation = { category: string; message: string };
type CheckResult = { violations: Violation[] };
type ExpoConfigPlugin = string | [string, Record<string, unknown>];

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
  ] as ExpoConfigPlugin[],
  experiments: { typedRoutes: true, reactCompiler: true },
};

const PREBUILD_ANDROID_PERMISSIONS = [
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.INTERNET",
];

const MEANINGFUL_TEST_PATHS = [
  "tests/config/app-config.test.ts",
  "tests/core/public-env.test.ts",
  "tests/core/logger.test.ts",
  "tests/core/app-error-boundary.test.tsx",
  "tests/core/app-providers.test.tsx",
  "tests/features/development-fixture-screen.test.tsx",
  "tests/app/thin-routes.test.tsx",
  "tests/quality/check-architecture.test.ts",
];

const FORMAT_SCOPE_MAIN_OPERANDS = [
  "app.config.ts",
  "eslint.config.js",
  "jest.config.js",
  "package.json",
  "src/app/_layout.tsx",
  "src/app/index.tsx",
  "src/core/config",
  "src/core/logging",
  "src/core/errors",
  "src/core/providers",
  "src/core/theme",
  "src/features/development-fixture",
  "src/shared/ui",
  "tests",
  "tools/quality",
  "README.md",
  "docs/adr/0004-m3-app-foundation-and-preference-deferral.md",
];

const FORMAT_SCOPE_FINAL_DOCS_OPERANDS = ["docs/evidence/M3.md"];

const FORMAT_SCOPE_MAIN_EFFECTIVE_FILES = [
  "app.config.ts",
  "eslint.config.js",
  "jest.config.js",
  "package.json",
  "src/app/_layout.tsx",
  "src/app/index.tsx",
  "src/core/config/expo-base-config.json",
  "src/core/config/public-env.ts",
  "src/core/logging/logger.ts",
  "src/core/errors/app-error-boundary.tsx",
  "src/core/providers/app-providers.tsx",
  "src/core/theme/tokens.ts",
  "src/core/theme/theme-provider.tsx",
  "src/features/development-fixture/model/local-fixture.ts",
  "src/features/development-fixture/ui/development-fixture-screen.tsx",
  "src/shared/ui/app-screen.tsx",
  "src/shared/ui/app-text.tsx",
  ...MEANINGFUL_TEST_PATHS,
  "tools/quality/check-architecture.cjs",
  "README.md",
  "docs/adr/0004-m3-app-foundation-and-preference-deferral.md",
];

const APPROVED_DEPENDENCIES = {
  expo: "~57.0.16",
  "expo-constants": "~57.0.14",
  "expo-dev-client": "~57.0.15",
  "expo-font": "~57.0.1",
  "expo-linking": "~57.0.7",
  "expo-router": "~57.0.16",
  "expo-splash-screen": "~57.0.8",
  "expo-system-ui": "~57.0.2",
  react: "19.2.3",
  "react-dom": "19.2.3",
  "react-native": "0.86.2",
  "react-native-gesture-handler": "~2.32.0",
  "react-native-reanimated": "4.5.1",
  "react-native-safe-area-context": "~5.7.0",
  "react-native-screens": "~4.26.0",
  "react-native-web": "~0.21.0",
  "react-native-worklets": "0.10.1",
};

const APPROVED_DEV_DEPENDENCIES = {
  "@testing-library/react-native": "^14.0.1",
  "@types/jest": "29.5.14",
  "@types/react": "~19.2.2",
  eslint: "^9.39.5",
  "eslint-config-expo": "~57.0.1",
  "expo-doctor": "^1.20.3",
  jest: "~29.7.0",
  "jest-expo": "~57.0.4",
  prettier: "^3.9.6",
  typescript: "~6.0.3",
};

const APPROVED_BUN_LOCK_SHA256 =
  "12877cc4c28921b793f86eb734412ead753751852fdb384e1c05d8b3014f1eb5";

const APPROVED_PACKAGE_TOP_LEVEL_KEYS = [
  "name",
  "main",
  "version",
  "dependencies",
  "devDependencies",
  "scripts",
  "private",
  "packageManager",
];

const REQUIRED_TRANSPORT_GLOBAL_NAMES = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "NetInfo",
];
const REQUIRED_TRANSPORT_PROPERTY_PATHS = [
  "global.fetch",
  "globalThis.fetch",
  "window.fetch",
];
const REQUIRED_TRANSPORT_MODULES = [
  "http",
  "node:http",
  "https",
  "node:https",
  "net",
  "node:net",
  "tls",
  "node:tls",
  "dgram",
  "node:dgram",
  "undici",
  "expo-network",
  "@react-native-community/netinfo",
];
const REQUIRED_SCREEN_HTTP_CLIENT_MODULES = [
  "axios",
  "ky",
  "cross-fetch",
  "node-fetch",
  "isomorphic-fetch",
  "whatwg-fetch",
];
const REQUIRED_ROUTE_PERSISTENCE_MODULES = [
  "expo-sqlite",
  "react-native-sqlite-storage",
  "realm",
  "@nozbe/watermelondb",
  "@react-native-async-storage/async-storage",
  "expo-secure-store",
  "expo-auth-session",
  "expo-notifications",
];

const COVERAGE_DECLARATION_RATIONALE =
  "Type declarations contain no executable branches; this covers preserved src/types/expo.d.ts only.";
const COVERAGE_OUT_OF_DENOMINATOR_RATIONALE = [
  {
    path: "eslint.config.js",
    rationale:
      "Runner configuration rather than application/runtime or architecture-policy behavior; its exact structure is mechanically checked and bun run lint executes it.",
  },
  {
    path: "jest.config.js",
    rationale:
      "Runner configuration rather than application/runtime behavior; its exact structure is mechanically checked and bun run test/test:coverage execute it.",
  },
  {
    path: "tools/quality/check-architecture.cjs",
    rationale:
      "Repository/dependency/native/generated/script/config-binding anti-bypass checker rather than application/runtime behavior; its pure exports are fixture-tested and bun run check:architecture executes the same implementation, but checker tests do not inflate application coverage.",
  },
];

const REQUIRED_SCREEN_FILES_GLOBS = [
  "src/features/**/ui/**/*.ts",
  "src/features/**/ui/**/*.tsx",
  "src/shared/ui/**/*.ts",
  "src/shared/ui/**/*.tsx",
];

const REQUIRED_ROUTE_FILES_GLOBS = ["src/app/**/*.ts", "src/app/**/*.tsx"];
const REQUIRED_SCREEN_CORE_PATTERNS = [
  "**/core/http",
  "**/core/http/**",
  "**/core/network",
  "**/core/network/**",
];
const REQUIRED_ROUTE_CORE_PATTERNS = [
  "**/core/database",
  "**/core/database/**",
  "**/core/realtime",
  "**/core/realtime/**",
  "**/core/auth",
  "**/core/auth/**",
  "**/core/storage",
  "**/core/storage/**",
  "**/core/logging",
  "**/core/logging/**",
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function buildValidRepositorySnapshot() {
  const resolvedDevelopment = clone(PINNED_BASE) as typeof PINNED_BASE & {
    name: string;
    slug: string;
    scheme?: string;
  };
  resolvedDevelopment.name = "Jamye Development";
  resolvedDevelopment.slug = "jamye-development";
  (resolvedDevelopment.ios as Record<string, unknown>).bundleIdentifier =
    "dev.local.jamyeapp";
  (resolvedDevelopment.android as Record<string, unknown>).package =
    "dev.local.jamyeapp";
  (resolvedDevelopment.android as Record<string, unknown>).permissions = clone(
    PREBUILD_ANDROID_PERMISSIONS,
  );
  resolvedDevelopment.plugins = [
    ...clone(PINNED_BASE.plugins),
    ["expo-dev-client", { addGeneratedScheme: true }],
  ];

  return {
    packageJson: {
      scripts: {
        lint: "eslint app.config.ts eslint.config.js jest.config.js src tests tools/quality",
        "format:check":
          "prettier --check app.config.ts eslint.config.js jest.config.js package.json src/app/_layout.tsx src/app/index.tsx src/core/config src/core/logging src/core/errors src/core/providers src/core/theme src/features/development-fixture src/shared/ui tests tools/quality README.md docs/adr/0004-m3-app-foundation-and-preference-deferral.md",
        "format:check:final-docs": "prettier --check docs/evidence/M3.md",
        test: "jest",
        "test:coverage": "jest --coverage --runInBand",
        "check:architecture": "node tools/quality/check-architecture.cjs",
        ios: "expo run:ios",
        android: "expo run:android",
      },
      dependencies: clone(APPROVED_DEPENDENCIES),
      devDependencies: clone(APPROVED_DEV_DEPENDENCIES),
      name: "template",
      main: "expo-router/entry",
      version: "1.0.0",
      private: true,
      packageManager: "bun@1.3.13",
      topLevelKeys: clone(APPROVED_PACKAGE_TOP_LEVEL_KEYS),
    },
    jest: {
      preset: "jest-expo",
      roots: ["<rootDir>/tests"],
      passWithNoTests: false,
      coverageDirectory: "<rootDir>/coverage",
      collectCoverageFrom: [
        "app.config.ts",
        "src/**/*.{ts,tsx}",
        "!src/**/*.d.ts",
      ],
      coverageThreshold: {
        global: { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
    coverageRationale: {
      declarationNegativeGlob: COVERAGE_DECLARATION_RATIONALE,
      outOfDenominatorRunnerConfigs: clone(
        COVERAGE_OUT_OF_DENOMINATOR_RATIONALE,
      ),
    },
    testInventory: clone(MEANINGFUL_TEST_PATHS),
    repositoryLockfiles: ["bun.lock"],
    bunLockSha256: APPROVED_BUN_LOCK_SHA256,
    easJsonPresent: false,
    eslintConfig: {
      usesExpoFlatConfig: true,
      transportEnforcedGlobs: ["app.config.ts", "src/**/*.ts", "src/**/*.tsx"],
      forbidsCoverageIgnoreDirectives: true,
      preventsInlineRuleBypass: true,
      restrictedGlobalNames: clone(REQUIRED_TRANSPORT_GLOBAL_NAMES),
      restrictedPropertyPaths: clone(REQUIRED_TRANSPORT_PROPERTY_PATHS),
      staticImportModules: clone(REQUIRED_TRANSPORT_MODULES),
      requireOrDynamicImportModules: clone(REQUIRED_TRANSPORT_MODULES),
      hasBypassOrIgnoreState: false,
      screenOverride: {
        files: clone(REQUIRED_SCREEN_FILES_GLOBS),
        requireRuleEnabled: true,
        staticImportModules: [
          ...clone(REQUIRED_TRANSPORT_MODULES),
          ...clone(REQUIRED_SCREEN_HTTP_CLIENT_MODULES),
        ],
        requireOrDynamicImportModules: [
          ...clone(REQUIRED_TRANSPORT_MODULES),
          ...clone(REQUIRED_SCREEN_HTTP_CLIENT_MODULES),
        ],
        staticImportPatterns: clone(REQUIRED_SCREEN_CORE_PATTERNS),
        requireOrDynamicImportPatterns: clone(REQUIRED_SCREEN_CORE_PATTERNS),
      },
      routeOverride: {
        files: clone(REQUIRED_ROUTE_FILES_GLOBS),
        requireRuleEnabled: true,
        staticImportModules: [
          ...clone(REQUIRED_TRANSPORT_MODULES),
          ...clone(REQUIRED_ROUTE_PERSISTENCE_MODULES),
        ],
        requireOrDynamicImportModules: [
          ...clone(REQUIRED_TRANSPORT_MODULES),
          ...clone(REQUIRED_ROUTE_PERSISTENCE_MODULES),
        ],
        staticImportPatterns: clone(REQUIRED_ROUTE_CORE_PATTERNS),
        requireOrDynamicImportPatterns: clone(REQUIRED_ROUTE_CORE_PATTERNS),
      },
    },
    expoBase: {
      pinnedBase: clone(PINNED_BASE),
      resolvedDevelopment,
    },
    formatScopes: {
      mainOperands: clone(FORMAT_SCOPE_MAIN_OPERANDS),
      finalDocsOperands: clone(FORMAT_SCOPE_FINAL_DOCS_OPERANDS),
      mainEffectiveFiles: clone(FORMAT_SCOPE_MAIN_EFFECTIVE_FILES),
    },
    generatedOutputs: {
      trackedPaths: [] as string[],
      inheritedClassification: {
        nodeModules: "ignored-untracked-unstaged",
        expoDir: "ignored-untracked-unstaged",
        expoEnvDts: "ignored-untracked-unstaged",
        coverageDir: "absent",
        iosDir: "absent",
        androidDir: "absent",
      },
      keystoreFiles: [] as string[],
    },
    reservedPathsPresent: [] as string[],
    testRunnerDependencies: {
      hasVitest: false,
      hasVitestConfig: false,
    },
  };
}

describe("checkArchitecture (M3 quality_contract pure policy validator)", () => {
  test("accepts the canonical valid repository snapshot with zero violations", () => {
    const result: CheckResult = checkArchitecture(
      buildValidRepositorySnapshot(),
    );
    expect(result.violations).toEqual([]);
  });

  test("denies a success-forcing recursive format:check script (exact-scripts)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.packageJson.scripts["format:check"] =
      "prettier --check src || true";

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain("exact-scripts");
  });

  test("denies passWithNoTests=true (jest-execution)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.jest.passWithNoTests = true;

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "jest-execution",
    );
  });

  test("denies a below-threshold global branches coverage value (coverage-contract)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.jest.coverageThreshold.global.branches = 79;

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "coverage-contract",
    );
  });

  test("denies a template/generated-only meaningful test inventory (meaningful-inventory)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.testInventory = ["tests/App-test.js"];

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "meaningful-inventory",
    );
  });

  test("denies a foreign lockfile beside bun.lock (dependency-and-lockfile)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.repositoryLockfiles = ["bun.lock", "package-lock.json"];

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "dependency-and-lockfile",
    );
  });

  test("denies a removed development-fixture transport lint scope (lint-transport-binding)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.eslintConfig.transportEnforcedGlobs = [
      "app.config.ts",
      "src/**/*.ts",
    ];

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "lint-transport-binding",
    );
  });

  test("denies a dropped preserved Expo base field (expo-base-preservation)", () => {
    const snapshot = buildValidRepositorySnapshot();
    delete (
      snapshot.expoBase.resolvedDevelopment.android as Record<string, unknown>
    ).predictiveBackGestureEnabled;

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "expo-base-preservation",
    );
  });

  test("denies an unapproved Expo prebuild Android permission (expo-base-preservation)", () => {
    const snapshot = buildValidRepositorySnapshot();
    const android = snapshot.expoBase.resolvedDevelopment.android as Record<
      string,
      unknown
    >;
    (android.permissions as string[]).push("android.permission.CAMERA");

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "expo-base-preservation",
    );
  });

  test("ignores only the standalone checker policy declaration for the deleted tutorial asset", () => {
    const tutorialAssetPath = ["assets", "images", "tutorial-web.png"].join(
      "/",
    );
    const checkerPath = "tools/quality/check-architecture.cjs";

    expect(
      classifyTutorialAssetReferencesInText(
        checkerPath,
        `  "${tutorialAssetPath}",`,
      ),
    ).toEqual({
      policyDeclarationCount: 1,
      hasUnapprovedReference: false,
    });
    expect(
      classifyTutorialAssetReferencesInText(
        checkerPath,
        `  '${tutorialAssetPath}',\nconst tutorial = "${tutorialAssetPath}";`,
      ),
    ).toEqual({
      policyDeclarationCount: 1,
      hasUnapprovedReference: true,
    });
  });

  test("allows only the exact approved TSC recovery path in the working-tree overlay", () => {
    expect(isAuthorizedWorkingTreePath("tsconfig.json")).toBe(true);
    expect(isAuthorizedWorkingTreePath("tsconfig.recovery.json")).toBe(false);
  });

  test("denies a tracked generated/native output path (generated-native-output)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.generatedOutputs.trackedPaths = ["expo-env.d.ts"];

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "generated-native-output",
    );
  });

  test("denies a public custom scheme on the development variant (variant-and-security)", () => {
    const snapshot = buildValidRepositorySnapshot();
    (snapshot.expoBase.resolvedDevelopment as Record<string, unknown>).scheme =
      "jamye";

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "variant-and-security",
    );
  });

  test("denies a second test runner installed beside Jest/jest-expo (single-test-runner)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.testRunnerDependencies.hasVitest = true;

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "single-test-runner",
    );
  });
});
