import {
  APPROVED_NATIVE_TOOLCHAIN_FILE_SHA256,
  APPROVED_RECOVERY_FILE_SHA256,
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
  "tests/quality/development-workflow.test.ts",
  "tests/quality/nix-avd.test.ts",
];

const APPROVED_DEPENDENCIES = {
  expo: "~57.0.17",
  "expo-constants": "~57.0.15",
  "expo-dev-client": "~57.0.16",
  "expo-font": "~57.0.1",
  "expo-linking": "~57.0.8",
  "expo-router": "~57.0.17",
  "expo-splash-screen": "~57.0.8",
  "expo-system-ui": "~57.0.3",
  react: "19.2.3",
  "react-dom": "19.2.3",
  "react-native": "0.86.3",
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
  "eslint-config-expo": "~57.0.2",
  "expo-doctor": "^1.20.3",
  jest: "~29.7.0",
  "jest-expo": "~57.0.5",
  prettier: "^3.9.6",
  typescript: "~6.0.3",
};

const APPROVED_BUN_LOCK_SHA256 =
  "6293cd852d889a51adaa80728433371d5557e956c03c72f8d650319a462c0032";

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
    path: "tools/quality/jest-env.cjs",
    rationale:
      "Jest-only dotenv bootstrap rather than bundled application/runtime behavior; its exact globalSetup path is mechanically checked and every Jest run executes it before suite environments are created.",
  },
  {
    path: "tools/quality/check-architecture.cjs",
    rationale:
      "Repository/dependency/native/generated/script/config-binding anti-bypass checker rather than application/runtime behavior; its pure exports are fixture-tested and bun run check:architecture executes the same implementation, but checker tests do not inflate application coverage.",
  },
  {
    path: "tools/android/nix-avd.cjs",
    rationale:
      "Local native-toolchain workflow code rather than bundled application/runtime behavior; its pure contract helpers are fixture-tested without inflating application coverage.",
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
        typecheck: "tsc --noEmit",
        lint: 'eslint "*.{js,cjs,mjs,ts,tsx}" src tests tools',
        "format:check": "prettier --check .",
        "format:write": "prettier --write",
        test: "jest",
        "test:watch": "jest --watch",
        "test:coverage": "jest --coverage --runInBand",
        "check:architecture": "bun tools/quality/check-architecture.cjs",
        "check:code":
          "bun run typecheck && bun run lint && bun run format:check && bun run check:architecture && bun run test:coverage",
        "deps:install:frozen": "bun install --frozen-lockfile",
        "toolchain:flake": "nix flake check path:.",
        "toolchain:check": "./tools/diagnostics/toolchain-check.sh",
        "toolchain:check:native":
          "./tools/diagnostics/toolchain-check.sh --native-build",
        "check:toolchain": "bun run toolchain:flake && bun run toolchain:check",
        "android:gradle:stop": "./android/gradlew --stop",
        "android:avd:verify": "bun tools/android/nix-avd.cjs verify",
        "android:avd:create": "bun tools/android/nix-avd.cjs create",
        "android:avd:reconcile": "bun tools/android/nix-avd.cjs reconcile",
        "android:avd:start": "bun tools/android/nix-avd.cjs start",
        "android:avd:stop": "bun tools/android/nix-avd.cjs stop",
        "expo:install:check": "CI=1 expo install --check",
        "expo:doctor": "expo-doctor",
        "check:expo": "bun run expo:install:check && bun run expo:doctor",
        "expo:start": "expo start --dev-client",
        "expo:prebuild:clean": "expo prebuild --clean",
        "expo:run:ios": "expo run:ios --no-bundler",
        "expo:run:android": "expo run:android --no-bundler",
        check:
          "bun run check:code && bun run check:expo && bun run check:toolchain",
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
      globalSetup: "<rootDir>/tools/quality/jest-env.cjs",
      setupFiles: [] as string[],
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
    nativeToolchain: {
      avdSpec: {
        schemaVersion: 1,
        name: "jamye_pixel_9_api_36",
        device: "pixel_9",
        systemImage: {
          api: "36.1",
          extensionLevel: "20",
          isBaseSdk: "true",
          type: "google_apis_playstore",
          abi: "arm64-v8a",
          revision: "4",
        },
        emulator: {
          packageVersion: "37.1.11",
          runtimeVersion: "37.1.11.0",
          buildId: "15917651",
        },
        skin: {
          repository:
            "https://android.googlesource.com/platform/tools/adt/idea",
          commit: "ffa01542c9913977fa2cb8e518b49b8de0c05c9e",
          path: "artwork/resources/device-art-resources/pixel_9",
          files: {
            layout: {
              sourceHash: "sha256-lKlH/xWX/XP7F57YOUCxcjcoWNZuTTL3+wFOmBPZZvw=",
              contentSha256:
                "fd024b14e9d7c38042be3d2bd4dad0e93fb3d6cfe0e1884a1d15d23063103e4a",
            },
            "back.webp": {
              sourceHash: "sha256-BSNKszMH1hrnQKtJ9KdZSkg+rMVfTVUM9zfFM8KjIZw=",
              contentSha256:
                "d8ed1bcf314de2c293ee7ba7744349fa9233d24d47798189f9660369cae16f2d",
            },
            "mask.webp": {
              sourceHash: "sha256-FvaY99G9szIkcHWH67XtOQtcKVhOUabeuckgHwuzcwg=",
              contentSha256:
                "6f4fb00c5147da694c4d0b3c45c0b580db94b81b77528985b6f30e4c944f1ac4",
            },
          },
        },
        hardware: {
          "PlayStore.enabled": "true",
          "disk.dataPartition.size": "10G",
          "fastboot.forceColdBoot": "no",
          "fastboot.forceFastBoot": "yes",
          "hw.camera.back": "virtualscene",
          "hw.camera.front": "emulated",
          "hw.cpu.ncore": "4",
          "hw.device.name": "pixel_9",
          "hw.lcd.density": "420",
          "hw.lcd.height": "2424",
          "hw.lcd.width": "1080",
          "hw.ramSize": "2048",
          "sdcard.size": "512M",
          "skin.name": "pixel_9",
          "vm.heapSize": "228",
        },
      },
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

  test("denies moving the project dotenv loader into suite setupFiles (jest-execution)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.jest.globalSetup = "<rootDir>/tools/quality/late-jest-env.cjs";
    snapshot.jest.setupFiles = ["<rootDir>/tools/quality/jest-env.cjs"];

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

  test("denies drift in the Nix-owned Pixel 9 AVD contract (nix-native-toolchain)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.nativeToolchain.avdSpec.hardware["hw.ramSize"] = "4096";

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "nix-native-toolchain",
    );
  });

  test("denies an unpinned Pixel 9 skin source (nix-native-toolchain)", () => {
    const snapshot = buildValidRepositorySnapshot();
    snapshot.nativeToolchain.avdSpec.skin.commit = "main";

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "nix-native-toolchain",
    );
  });

  test("denies a user-SDK path in the Nix AVD specification (nix-native-toolchain)", () => {
    const snapshot = buildValidRepositorySnapshot();
    (snapshot.nativeToolchain.avdSpec.hardware as Record<string, string>)[
      "skin.path"
    ] = "/Users/example/Library/Android/sdk/skins/pixel_9";

    const result: CheckResult = checkArchitecture(snapshot);

    expect(result.violations.map((v) => v.category)).toContain(
      "nix-native-toolchain",
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

  test("allows only the exact hash-bound approved recovery paths in the working-tree overlay", () => {
    expect(APPROVED_RECOVERY_FILE_SHA256).toEqual({
      "tsconfig.json":
        "b3fcbc507af0df8008ffae41c5132e2bafceb650f6f55347d7492e0d8f98e3c0",
    });
    expect(APPROVED_NATIVE_TOOLCHAIN_FILE_SHA256).toEqual({
      "nix/android-avd-spec.json":
        "c5a803ccc0b587752f308101b68c00619116c3285e0d96ea2b342f0c3f58a845",
      "nix/android-sdk.nix":
        "3b93574941b8cb3b1445a187c0cb1f2b65d80174eff94151d70fbd46f0224d58",
      "nix/dev-shell.nix":
        "27b22586b36e90e2cc35695ac29bcde55b018c1c73005eb9ef9962780536883a",
      "nix/toolchain-versions.nix":
        "a274f777e185929711a1dee2acbd665c538a494490246ebfbfaa1a5fba1b1d5c",
      "tools/diagnostics/toolchain-check.sh":
        "ade2efe2b149d926d83a91dbca5725280bd5e72a84f7a27a7bd0b9d1c20bbc7d",
    });

    for (const path of [
      ...Object.keys(APPROVED_RECOVERY_FILE_SHA256),
      ...Object.keys(APPROVED_NATIVE_TOOLCHAIN_FILE_SHA256),
    ]) {
      expect(isAuthorizedWorkingTreePath(path)).toBe(true);
    }

    expect(isAuthorizedWorkingTreePath("tsconfig.recovery.json")).toBe(false);
    expect(isAuthorizedWorkingTreePath("nix/dev-shell.cc.nix")).toBe(false);
    expect(
      isAuthorizedWorkingTreePath("tools/diagnostics/toolchain-check.local.sh"),
    ).toBe(false);
  });

  test("allows the approved project-document format migration but not accepted evidence", () => {
    for (const path of [
      "docs/adr/0001-expo-sdk-57-default-template.md",
      "docs/adr/0002-bun-only-package-management.md",
      "docs/adr/0003-m2-bootstrap-quality-evidence-deferment.md",
      "docs/plans/work/001-jamye-app-greenfield.md",
      "docs/product-intent.md",
      "docs/research/workspace-baseline.md",
      "docs/roadmap.md",
    ]) {
      expect(isAuthorizedWorkingTreePath(path)).toBe(true);
    }

    expect(isAuthorizedWorkingTreePath("docs/evidence/M1.md")).toBe(false);
    expect(isAuthorizedWorkingTreePath("docs/evidence/M2.md")).toBe(false);
    expect(isAuthorizedWorkingTreePath("AGENTS.md")).toBe(false);
    expect(isAuthorizedWorkingTreePath("CLAUDE.md")).toBe(false);
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
