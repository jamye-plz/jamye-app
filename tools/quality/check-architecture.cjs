"use strict";

/**
 * Single repository-invariant checker for the M3 quality_contract.
 *
 * checkArchitecture(snapshot) is a pure validator: given a plain-data
 * repository snapshot it returns { violations: [{ category, message }] }
 * with zero filesystem/process access. The guarded CLI entry point below
 * builds a live snapshot from the real repository (package.json,
 * jest.config.js, eslint.config.js, git-tracked paths, and the resolved
 * Expo config) and calls the same pure function, then performs a small set
 * of additional live-only checks that have no equivalent in the pure
 * snapshot shape (file existence, tracked/ignored classification, and the
 * ESLint flat-config route/screen overrides). It never opens or scans
 * app.config.ts or any src TS/TSX file for transport calls, identifiers,
 * imports, requires, comments, or directives — that enforcement belongs
 * solely to the configured ESLint pass (quality_contract.transport_enforcement).
 */

const EXACT_PACKAGE_SCRIPTS = Object.freeze({
  lint: "eslint app.config.ts eslint.config.js jest.config.js src tests tools/quality",
  "format:check":
    "prettier --check app.config.ts eslint.config.js jest.config.js package.json src/app/_layout.tsx src/app/index.tsx src/core/config src/core/logging src/core/errors src/core/providers src/core/theme src/features/development-fixture src/shared/ui tests tools/quality README.md docs/adr/0004-m3-app-foundation-and-preference-deferral.md",
  "format:check:final-docs": "prettier --check docs/evidence/M3.md",
  test: "jest",
  "test:coverage": "jest --coverage --runInBand",
  "check:architecture": "node tools/quality/check-architecture.cjs",
  ios: "expo run:ios",
  android: "expo run:android",
});

const COVERAGE_POSITIVE_DENOMINATOR = Object.freeze([
  "app.config.ts",
  "src/**/*.{ts,tsx}",
]);
const COVERAGE_NEGATIVE_GLOB = "!src/**/*.d.ts";
const COVERAGE_COLLECT_FROM = Object.freeze([
  ...COVERAGE_POSITIVE_DENOMINATOR,
  COVERAGE_NEGATIVE_GLOB,
]);
const GLOBAL_COVERAGE_THRESHOLD = Object.freeze({
  statements: 80,
  branches: 80,
  functions: 80,
  lines: 80,
});
const JEST_PRESET = "jest-expo";
const JEST_ROOTS = Object.freeze(["<rootDir>/tests"]);
const JEST_COVERAGE_DIRECTORY = "<rootDir>/coverage";
const COVERAGE_DECLARATION_RATIONALE =
  "Type declarations contain no executable branches; this covers preserved src/types/expo.d.ts only.";
const COVERAGE_OUT_OF_DENOMINATOR_RATIONALE = Object.freeze([
  Object.freeze({
    path: "eslint.config.js",
    rationale:
      "Runner configuration rather than application/runtime or architecture-policy behavior; its exact structure is mechanically checked and bun run lint executes it.",
  }),
  Object.freeze({
    path: "jest.config.js",
    rationale:
      "Runner configuration rather than application/runtime behavior; its exact structure is mechanically checked and bun run test/test:coverage execute it.",
  }),
  Object.freeze({
    path: "tools/quality/check-architecture.cjs",
    rationale:
      "Repository/dependency/native/generated/script/config-binding anti-bypass checker rather than application/runtime behavior; its pure exports are fixture-tested and bun run check:architecture executes the same implementation, but checker tests do not inflate application coverage.",
  }),
]);

const MEANINGFUL_TEST_PATHS = Object.freeze([
  "tests/config/app-config.test.ts",
  "tests/core/public-env.test.ts",
  "tests/core/logger.test.ts",
  "tests/core/app-error-boundary.test.tsx",
  "tests/core/app-providers.test.tsx",
  "tests/features/development-fixture-screen.test.tsx",
  "tests/app/thin-routes.test.tsx",
  "tests/quality/check-architecture.test.ts",
]);

const REQUIRED_TRANSPORT_GLOBS = Object.freeze([
  "app.config.ts",
  "src/**/*.ts",
  "src/**/*.tsx",
]);

const FOREIGN_LOCKFILES = Object.freeze([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
]);

const JEST_ALTERNATE_IGNORE_CONTROLS = Object.freeze([
  "coveragePathIgnorePatterns",
  "testPathIgnorePatterns",
  "modulePathIgnorePatterns",
  "watchPathIgnorePatterns",
]);

const REQUIRED_ABSENT_DEMO_DIRECT_DEPENDENCIES = Object.freeze([
  "@expo/ui",
  "expo-device",
  "expo-glass-effect",
  "expo-image",
  "expo-status-bar",
  "expo-symbols",
  "expo-web-browser",
]);

const DIRECT_DEPENDENCY_DENYLIST = Object.freeze([
  "@react-navigation/*",
  "react-navigation",
  "nativewind",
  "tamagui",
  "@tamagui/*",
  "react-native-paper",
  "@gluestack-ui/*",
  "react-native-ui-lib",
  "@shopify/restyle",
  "@tanstack/react-query",
  "react-query",
  "swr",
  "@apollo/client",
  "zustand",
  "redux",
  "@reduxjs/toolkit",
  "jotai",
  "mobx",
  "recoil",
  "expo-sqlite",
  "react-native-sqlite-storage",
  "realm",
  "@nozbe/watermelondb",
  "@react-native-async-storage/async-storage",
  "expo-secure-store",
  "expo-auth-session",
  "expo-notifications",
  "axios",
  "ky",
  "ws",
  "socket.io-client",
  "undici",
  "expo-network",
  "@react-native-community/netinfo",
  "react-test-renderer",
  "@types/react-test-renderer",
  "vitest",
  "@vitest/*",
]);

const GENERATED_OUTPUT_TRACKED_ROOTS = Object.freeze([
  "coverage",
  "ios",
  "android",
  ".expo",
  "expo-env.d.ts",
  "node_modules",
]);
const OPTIONAL_GENERATED_OUTPUT_CLASSIFICATIONS = Object.freeze([
  "coverageDir",
  "iosDir",
  "androidDir",
]);

const FORMAT_SCOPE_MAIN_OPERANDS = Object.freeze([
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
]);

const FORMAT_SCOPE_FINAL_DOCS_OPERANDS = Object.freeze(["docs/evidence/M3.md"]);

const FORMAT_SCOPE_MAIN_EFFECTIVE_FILES = Object.freeze([
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
]);

const APPROVED_DEPENDENCIES = Object.freeze({
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
});

const APPROVED_DEV_DEPENDENCIES = Object.freeze({
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
});

const APPROVED_MANIFEST_POINTERS = Object.freeze({
  name: "template",
  main: "expo-router/entry",
  version: "1.0.0",
  private: true,
  packageManager: "bun@1.3.13",
});
const APPROVED_PACKAGE_TOP_LEVEL_KEYS = Object.freeze([
  "name",
  "main",
  "version",
  "dependencies",
  "devDependencies",
  "scripts",
  "private",
  "packageManager",
]);

const APPROVED_BUN_LOCK_SHA256 =
  "12877cc4c28921b793f86eb734412ead753751852fdb384e1c05d8b3014f1eb5";

const APPROVED_DEVELOPMENT_IDENTITY = Object.freeze({
  name: "Jamye Development",
  slug: "jamye-development",
  iosBundleIdentifier: "dev.local.jamyeapp",
  androidPackage: "dev.local.jamyeapp",
});

const APPROVED_DEV_CLIENT_PLUGIN = Object.freeze([
  "expo-dev-client",
  Object.freeze({ addGeneratedScheme: true }),
]);

const APPROVED_PREBUILD_ANDROID_PERMISSIONS = Object.freeze([
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.INTERNET",
]);

const APPROVED_EXPO_BASE = Object.freeze({
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  ios: Object.freeze({ icon: "./assets/expo.icon" }),
  android: Object.freeze({
    adaptiveIcon: Object.freeze({
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    }),
    predictiveBackGestureEnabled: false,
  }),
  web: Object.freeze({
    output: "static",
    favicon: "./assets/images/favicon.png",
  }),
  plugins: Object.freeze([
    "expo-router",
    Object.freeze([
      "expo-splash-screen",
      Object.freeze({
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      }),
    ]),
  ]),
  experiments: Object.freeze({ typedRoutes: true, reactCompiler: true }),
});

const SOLE_ALLOWED_GENERATED_KEYSTORE = "android/app/debug.keystore";
const SIGNING_OR_CREDENTIAL_FILE_PATTERN =
  /(?:^|\/)(?:credentials\.json|google-services\.json|GoogleService-Info\.plist)$|\.(?:keystore|jks|p8|p12|mobileprovision|provisionprofile|cer|pem|key)$/i;

const REQUIRED_TRANSPORT_GLOBAL_NAMES = Object.freeze([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "NetInfo",
]);
const REQUIRED_TRANSPORT_PROPERTY_PATHS = Object.freeze([
  "global.fetch",
  "globalThis.fetch",
  "window.fetch",
]);
const REQUIRED_TRANSPORT_MODULES = Object.freeze([
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
]);
const REQUIRED_SCREEN_HTTP_CLIENT_MODULES = Object.freeze([
  "axios",
  "ky",
  "cross-fetch",
  "node-fetch",
  "isomorphic-fetch",
  "whatwg-fetch",
]);
const REQUIRED_ROUTE_PERSISTENCE_MODULES = Object.freeze([
  "expo-sqlite",
  "react-native-sqlite-storage",
  "realm",
  "@nozbe/watermelondb",
  "@react-native-async-storage/async-storage",
  "expo-secure-store",
  "expo-auth-session",
  "expo-notifications",
]);

const REQUIRED_SCREEN_FILES_GLOBS = Object.freeze([
  "src/features/**/ui/**/*.ts",
  "src/features/**/ui/**/*.tsx",
  "src/shared/ui/**/*.ts",
  "src/shared/ui/**/*.tsx",
]);

const REQUIRED_ROUTE_FILES_GLOBS = Object.freeze([
  "src/app/**/*.ts",
  "src/app/**/*.tsx",
]);

const REQUIRED_SCREEN_CORE_PATTERNS = Object.freeze([
  "**/core/http",
  "**/core/http/**",
  "**/core/network",
  "**/core/network/**",
]);

const REQUIRED_ROUTE_CORE_PATTERNS = Object.freeze([
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
]);

const M1_M2_EVIDENCE_BASELINE_SHA256 = Object.freeze({
  "docs/evidence/M1.md":
    "2aa66c84e771663443aa177b069fcaf35305614f88b06667aa54d50f884b344d",
  "docs/evidence/M2.md":
    "c690e3887f5b395d40d4992a6ed30104e7bc06cba1f43c6e3c917817fed62b08",
});
const APPROVED_RECOVERY_FILE_SHA256 = Object.freeze({
  "tsconfig.json":
    "b3fcbc507af0df8008ffae41c5132e2bafceb650f6f55347d7492e0d8f98e3c0",
});
const APPROVED_GITIGNORE_SHA256 =
  "6883c1a58109dd965438a530c4bb477960be71708255d4c96b8dd0652d586566";
const PRETTIER_SUPPORTED_EXTENSIONS = Object.freeze(
  new Set([
    ".js",
    ".cjs",
    ".mjs",
    ".jsx",
    ".ts",
    ".cts",
    ".mts",
    ".tsx",
    ".json",
    ".json5",
    ".jsonc",
    ".md",
    ".mdx",
    ".css",
    ".scss",
    ".less",
    ".html",
    ".htm",
    ".vue",
    ".yaml",
    ".yml",
    ".graphql",
    ".gql",
    ".hbs",
    ".handlebars",
    ".svg",
    ".xml",
  ]),
);
const RESERVED_DEFERRED_PATHS = Object.freeze([
  "app",
  "src/store",
  "src/navigation",
  "src/navigators",
  "src/routes",
  "src/router",
  "src/core/auth",
  "src/core/contracts",
  "src/core/database",
  "src/core/network",
  "src/core/platform",
  "src/core/push",
  "src/core/realtime",
  "src/core/sync",
  "src/core/storage",
]);

const AUTHORIZED_CREATE_OR_REPLACE_PATHS = Object.freeze([
  "app.config.ts",
  ".env.example",
  ".gitignore",
  "eslint.config.js",
  "jest.config.js",
  "package.json",
  "bun.lock",
  ...FORMAT_SCOPE_MAIN_EFFECTIVE_FILES.filter(
    (file) =>
      file !== "app.config.ts" &&
      file !== "eslint.config.js" &&
      file !== "jest.config.js" &&
      file !== "package.json",
  ),
  "docs/roadmap.md",
  "docs/evidence/M3.md",
]);

const APPROVED_RECOVERY_CREATE_OR_REPLACE_PATHS = Object.freeze(
  Object.keys(APPROVED_RECOVERY_FILE_SHA256),
);

const AUTHORIZED_DELETE_PATHS = Object.freeze([
  "app.json",
  "src/app/explore.tsx",
  "scripts/reset-project.js",
  "src/components/animated-icon.module.css",
  "src/components/animated-icon.tsx",
  "src/components/animated-icon.web.tsx",
  "src/components/app-tabs.tsx",
  "src/components/app-tabs.web.tsx",
  "src/components/external-link.tsx",
  "src/components/hint-row.tsx",
  "src/components/themed-text.tsx",
  "src/components/themed-view.tsx",
  "src/components/ui/collapsible.tsx",
  "src/components/web-badge.tsx",
  "src/constants/theme.ts",
  "src/global.css",
  "src/hooks/use-color-scheme.ts",
  "src/hooks/use-color-scheme.web.ts",
  "src/hooks/use-theme.ts",
  "assets/images/expo-badge-white.png",
  "assets/images/expo-badge.png",
  "assets/images/expo-logo.png",
  "assets/images/logo-glow.png",
  "assets/images/react-logo.png",
  "assets/images/react-logo@2x.png",
  "assets/images/react-logo@3x.png",
  "assets/images/tabIcons/explore.png",
  "assets/images/tabIcons/explore@2x.png",
  "assets/images/tabIcons/explore@3x.png",
  "assets/images/tabIcons/home.png",
  "assets/images/tabIcons/home@2x.png",
  "assets/images/tabIcons/home@3x.png",
  "assets/images/tutorial-web.png",
]);

const REQUIRED_PRE_QUALITY_PATHS = Object.freeze([
  ".env.example",
  ".gitignore",
  "bun.lock",
  ...FORMAT_SCOPE_MAIN_EFFECTIVE_FILES,
]);

const TUTORIAL_ASSET_PATH = AUTHORIZED_DELETE_PATHS.find((relativePath) =>
  relativePath.endsWith("/tutorial-web.png"),
);
const TUTORIAL_POLICY_CHECKER_PATH = "tools/quality/check-architecture.cjs";
const TUTORIAL_REFERENCE_SCAN_ROOTS = Object.freeze([
  "app.config.ts",
  "package.json",
  "scripts",
  "src",
  "tests",
  "tools",
]);
const TUTORIAL_REFERENCE_EXTENSIONS = Object.freeze(
  new Set([
    ".js",
    ".cjs",
    ".mjs",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".css",
    ".md",
  ]),
);

// ---------------------------------------------------------------------------
// Generic pure helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (
    aKeys.length !== bKeys.length ||
    aKeys.some((key, index) => key !== bKeys[index])
  )
    return false;
  return aKeys.every((key) => deepEqual(a[key], b[key]));
}

function classifyTutorialAssetReferencesInText(relativePath, contents) {
  let policyDeclarationCount = 0;
  const searchableContents = contents
    .split("\n")
    .map((line) => {
      if (relativePath !== TUTORIAL_POLICY_CHECKER_PATH) return line;

      const literalMatch = line.trim().match(/^(["'])(.*)\1,?$/);
      if (literalMatch && literalMatch[2] === TUTORIAL_ASSET_PATH) {
        policyDeclarationCount += 1;
        return "";
      }
      return line;
    })
    .join("\n");

  return {
    policyDeclarationCount,
    hasUnapprovedReference: searchableContents.includes(TUTORIAL_ASSET_PATH),
  };
}

function isAuthorizedWorkingTreePath(relativePath) {
  return (
    AUTHORIZED_CREATE_OR_REPLACE_PATHS.includes(relativePath) ||
    APPROVED_RECOVERY_CREATE_OR_REPLACE_PATHS.includes(relativePath) ||
    AUTHORIZED_DELETE_PATHS.includes(relativePath)
  );
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual)) return false;
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return (
    sortedActual.length === sortedExpected.length &&
    sortedActual.every((value, index) => value === sortedExpected[index])
  );
}

function normalizeCommand(command) {
  return typeof command === "string"
    ? command.trim().replace(/\s+/g, " ")
    : command;
}

function pushViolation(violations, category, message) {
  violations.push({ category, message });
}

// ---------------------------------------------------------------------------
// Pure category validators (exercised directly by tests/quality/check-architecture.test.ts)
// ---------------------------------------------------------------------------

function checkExactScripts(snapshot, violations) {
  const scripts = isPlainObject(snapshot && snapshot.packageJson)
    ? snapshot.packageJson.scripts
    : undefined;
  if (!isPlainObject(scripts)) {
    pushViolation(
      violations,
      "exact-scripts",
      "packageJson.scripts is required.",
    );
    return;
  }

  const expectedKeys = Object.keys(EXACT_PACKAGE_SCRIPTS);
  const actualKeys = Object.keys(scripts);
  if (!sameStringSet(actualKeys, expectedKeys)) {
    pushViolation(
      violations,
      "exact-scripts",
      "package.json /scripts key set does not exactly equal quality_contract.exact_package_scripts.",
    );
    return;
  }

  for (const key of expectedKeys) {
    if (
      normalizeCommand(scripts[key]) !==
      normalizeCommand(EXACT_PACKAGE_SCRIPTS[key])
    ) {
      pushViolation(
        violations,
        "exact-scripts",
        `package.json scripts.${key} does not exactly equal the required quality_contract command.`,
      );
    }
  }

  const formatScopes = isPlainObject(snapshot && snapshot.formatScopes)
    ? snapshot.formatScopes
    : {};
  const mainOperands = Array.isArray(formatScopes.mainOperands)
    ? formatScopes.mainOperands
    : [];
  const mainEffectiveFiles = Array.isArray(formatScopes.mainEffectiveFiles)
    ? formatScopes.mainEffectiveFiles
    : [];
  const finalDocsOperands = Array.isArray(formatScopes.finalDocsOperands)
    ? formatScopes.finalDocsOperands
    : [];

  if (!sameStringSet(mainOperands, FORMAT_SCOPE_MAIN_OPERANDS)) {
    pushViolation(
      violations,
      "exact-scripts",
      "format:check main scope operands do not exactly equal quality_contract.format_scopes.main.",
    );
  }

  if (!sameStringSet(finalDocsOperands, FORMAT_SCOPE_FINAL_DOCS_OPERANDS)) {
    pushViolation(
      violations,
      "exact-scripts",
      "format:check:final-docs scope operands do not exactly equal quality_contract.format_scopes.final_docs.",
    );
  }

  if (!sameStringSet(mainEffectiveFiles, FORMAT_SCOPE_MAIN_EFFECTIVE_FILES)) {
    pushViolation(
      violations,
      "exact-scripts",
      "format:check main scope effective-file expansion does not exactly equal the Q0/I1/I2/I3/D1-owned file set.",
    );
  }

  const overlapsFinalDocs = mainEffectiveFiles.some((file) =>
    finalDocsOperands.includes(file),
  );
  const includesExcludedPath = mainEffectiveFiles.some(
    (file) =>
      file === "src/types/expo.d.ts" ||
      file === "docs/evidence/M1.md" ||
      file === "docs/evidence/M2.md",
  );
  if (overlapsFinalDocs || includesExcludedPath) {
    pushViolation(
      violations,
      "exact-scripts",
      "format:check main scope must be disjoint from the final-docs scope and must exclude src/types/expo.d.ts and M1/M2 evidence docs.",
    );
  }
}

function checkJestExecution(snapshot, violations) {
  const jestConfig = isPlainObject(snapshot && snapshot.jest)
    ? snapshot.jest
    : {};

  if (jestConfig.preset !== JEST_PRESET) {
    pushViolation(
      violations,
      "jest-execution",
      `jest preset must be exactly ${JEST_PRESET}.`,
    );
  }

  if (!sameStringSet(jestConfig.roots, JEST_ROOTS)) {
    pushViolation(
      violations,
      "jest-execution",
      "jest roots must contain exactly <rootDir>/tests.",
    );
  }

  if (jestConfig.coverageDirectory !== JEST_COVERAGE_DIRECTORY) {
    pushViolation(
      violations,
      "jest-execution",
      `jest coverageDirectory must be exactly ${JEST_COVERAGE_DIRECTORY}.`,
    );
  }

  if (jestConfig.passWithNoTests !== false) {
    pushViolation(
      violations,
      "jest-execution",
      "jest passWithNoTests must be exactly false.",
    );
  }

  for (const key of JEST_ALTERNATE_IGNORE_CONTROLS) {
    const value = jestConfig[key];
    if (Array.isArray(value) ? value.length > 0 : Boolean(value)) {
      pushViolation(
        violations,
        "jest-execution",
        `jest ${key} must be absent or empty.`,
      );
    }
  }
}

function checkCoverageContract(snapshot, violations) {
  const jestConfig = isPlainObject(snapshot && snapshot.jest)
    ? snapshot.jest
    : {};
  const coverageRationale = isPlainObject(
    snapshot && snapshot.coverageRationale,
  )
    ? snapshot.coverageRationale
    : {};

  if (!sameStringSet(jestConfig.collectCoverageFrom, COVERAGE_COLLECT_FROM)) {
    pushViolation(
      violations,
      "coverage-contract",
      "jest collectCoverageFrom must contain exactly the two-entry application denominator plus the sole negative glob !src/**/*.d.ts.",
    );
  }

  const coverageThreshold = jestConfig.coverageThreshold;
  if (
    !isPlainObject(coverageThreshold) ||
    !isPlainObject(coverageThreshold.global)
  ) {
    pushViolation(
      violations,
      "coverage-contract",
      "jest coverageThreshold.global is required.",
    );
    return;
  }

  if (Object.keys(coverageThreshold).length !== 1) {
    pushViolation(
      violations,
      "coverage-contract",
      "jest coverageThreshold must declare only the global key; path-specific thresholds are forbidden.",
    );
  }

  const global = coverageThreshold.global;
  const thresholdKeys = Object.keys(GLOBAL_COVERAGE_THRESHOLD);
  if (!sameStringSet(Object.keys(global), thresholdKeys)) {
    pushViolation(
      violations,
      "coverage-contract",
      "jest coverageThreshold.global must declare exactly statements, branches, functions, and lines.",
    );
  }

  for (const key of thresholdKeys) {
    const value = global[key];
    if (typeof value !== "number" || value < GLOBAL_COVERAGE_THRESHOLD[key]) {
      pushViolation(
        violations,
        "coverage-contract",
        `jest coverageThreshold.global.${key} must be a number >= ${GLOBAL_COVERAGE_THRESHOLD[key]}.`,
      );
    }
  }

  if (
    coverageRationale.declarationNegativeGlob !== COVERAGE_DECLARATION_RATIONALE
  ) {
    pushViolation(
      violations,
      "coverage-contract",
      "The sole declaration negative-glob rationale must exactly match quality_contract.coverage.",
    );
  }

  if (
    !deepEqual(
      coverageRationale.outOfDenominatorRunnerConfigs,
      COVERAGE_OUT_OF_DENOMINATOR_RATIONALE,
    )
  ) {
    pushViolation(
      violations,
      "coverage-contract",
      "Runner/checker out-of-denominator rationales must exactly match quality_contract.coverage.",
    );
  }
}

function checkMeaningfulInventory(snapshot, violations) {
  const testInventory = Array.isArray(snapshot && snapshot.testInventory)
    ? snapshot.testInventory
    : [];
  if (!sameStringSet(testInventory, MEANINGFUL_TEST_PATHS)) {
    pushViolation(
      violations,
      "meaningful-inventory",
      "testInventory must exactly equal quality_contract.meaningful_test_paths; template/generated-only or incomplete inventories fail.",
    );
  }
}

function checkDependencyAndLockfile(snapshot, violations) {
  const lockfiles = Array.isArray(snapshot && snapshot.repositoryLockfiles)
    ? snapshot.repositoryLockfiles
    : [];

  const foreignPresent = lockfiles.filter((name) =>
    FOREIGN_LOCKFILES.includes(name),
  );
  if (foreignPresent.length > 0) {
    pushViolation(
      violations,
      "dependency-and-lockfile",
      `Foreign lockfile(s) present beside bun.lock: ${foreignPresent.join(", ")}.`,
    );
  }

  if (!lockfiles.includes("bun.lock")) {
    pushViolation(
      violations,
      "dependency-and-lockfile",
      "bun.lock must be present as the sole repository lockfile.",
    );
  }

  const packageJson = isPlainObject(snapshot && snapshot.packageJson)
    ? snapshot.packageJson
    : {};

  if (
    !sameStringSet(packageJson.topLevelKeys, APPROVED_PACKAGE_TOP_LEVEL_KEYS)
  ) {
    pushViolation(
      violations,
      "dependency-and-lockfile",
      "package.json top-level key set must exactly match the approved dependency-gate manifest.",
    );
  }

  if (
    !deepEqual(
      isPlainObject(packageJson.dependencies) ? packageJson.dependencies : {},
      APPROVED_DEPENDENCIES,
    )
  ) {
    pushViolation(
      violations,
      "dependency-and-lockfile",
      "package.json /dependencies must exactly equal the approved G-M3-DEPENDENCY-INSTALL map.",
    );
  }

  if (
    !deepEqual(
      isPlainObject(packageJson.devDependencies)
        ? packageJson.devDependencies
        : {},
      APPROVED_DEV_DEPENDENCIES,
    )
  ) {
    pushViolation(
      violations,
      "dependency-and-lockfile",
      "package.json /devDependencies must exactly equal the approved G-M3-DEPENDENCY-INSTALL map.",
    );
  }

  for (const pointer of Object.keys(APPROVED_MANIFEST_POINTERS)) {
    if (packageJson[pointer] !== APPROVED_MANIFEST_POINTERS[pointer]) {
      pushViolation(
        violations,
        "dependency-and-lockfile",
        `package.json /${pointer} must remain exactly ${JSON.stringify(APPROVED_MANIFEST_POINTERS[pointer])}.`,
      );
    }
  }

  if (snapshot && snapshot.bunLockSha256 !== APPROVED_BUN_LOCK_SHA256) {
    pushViolation(
      violations,
      "dependency-and-lockfile",
      "bun.lock sha256 does not equal the approved G-M3-DEPENDENCY-INSTALL/G-M3-FROZEN-LOCKFILE hash.",
    );
  }
}

function checkLintTransportBinding(snapshot, violations) {
  const eslintConfig = isPlainObject(snapshot && snapshot.eslintConfig)
    ? snapshot.eslintConfig
    : {};

  if (eslintConfig.usesExpoFlatConfig !== true) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js must consume the official Expo flat config (eslint-config-expo/flat).",
    );
  }

  if (
    !sameStringSet(
      eslintConfig.transportEnforcedGlobs,
      REQUIRED_TRANSPORT_GLOBS,
    )
  ) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js transport-enforced scope must exactly equal app.config.ts, src/**/*.ts, and src/**/*.tsx.",
    );
  }

  if (eslintConfig.forbidsCoverageIgnoreDirectives !== true) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js must reject Istanbul/c8/v8 coverage-ignore directives across the transport-enforced scope.",
    );
  }

  if (eslintConfig.preventsInlineRuleBypass !== true) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js must set linterOptions.noInlineConfig=true across the transport-enforced scope.",
    );
  }

  if (
    !sameStringSet(
      eslintConfig.restrictedGlobalNames,
      REQUIRED_TRANSPORT_GLOBAL_NAMES,
    )
  ) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js must restrict the exact transport global identifier set.",
    );
  }

  if (
    !sameStringSet(
      eslintConfig.restrictedPropertyPaths,
      REQUIRED_TRANSPORT_PROPERTY_PATHS,
    )
  ) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js must restrict global.fetch, globalThis.fetch, and window.fetch.",
    );
  }

  if (
    !sameStringSet(
      eslintConfig.staticImportModules,
      REQUIRED_TRANSPORT_MODULES,
    ) ||
    !sameStringSet(
      eslintConfig.requireOrDynamicImportModules,
      REQUIRED_TRANSPORT_MODULES,
    )
  ) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js must restrict the exact transport module set for static import, require, and dynamic import.",
    );
  }

  if (eslintConfig.hasBypassOrIgnoreState !== false) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js transport, screen, and route enforcement entries must not declare ignores or disable required rules.",
    );
  }

  const screenOverride = isPlainObject(eslintConfig.screenOverride)
    ? eslintConfig.screenOverride
    : {};
  if (!sameStringSet(screenOverride.files, REQUIRED_SCREEN_FILES_GLOBS)) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js screen/component override files must exactly equal the required UI globs.",
    );
  }
  if (screenOverride.requireRuleEnabled !== true) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js screen/component override must enable local/no-restricted-transport-require without bypass.",
    );
  }
  if (
    !sameStringSet(screenOverride.staticImportModules, [
      ...REQUIRED_TRANSPORT_MODULES,
      ...REQUIRED_SCREEN_HTTP_CLIENT_MODULES,
    ]) ||
    !sameStringSet(screenOverride.requireOrDynamicImportModules, [
      ...REQUIRED_TRANSPORT_MODULES,
      ...REQUIRED_SCREEN_HTTP_CLIENT_MODULES,
    ])
  ) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js screen/component override must restrict the exact transport and HTTP-client module set.",
    );
  }
  if (
    !sameStringSet(
      screenOverride.staticImportPatterns,
      REQUIRED_SCREEN_CORE_PATTERNS,
    ) ||
    !sameStringSet(
      screenOverride.requireOrDynamicImportPatterns,
      REQUIRED_SCREEN_CORE_PATTERNS,
    )
  ) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js screen/component override must reject core HTTP/network import and require/dynamic-import patterns.",
    );
  }

  const routeOverride = isPlainObject(eslintConfig.routeOverride)
    ? eslintConfig.routeOverride
    : {};
  if (!sameStringSet(routeOverride.files, REQUIRED_ROUTE_FILES_GLOBS)) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js route override files must exactly equal the required route globs.",
    );
  }
  if (routeOverride.requireRuleEnabled !== true) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js route override must enable local/no-restricted-transport-require without bypass.",
    );
  }
  if (
    !sameStringSet(routeOverride.staticImportModules, [
      ...REQUIRED_TRANSPORT_MODULES,
      ...REQUIRED_ROUTE_PERSISTENCE_MODULES,
    ]) ||
    !sameStringSet(routeOverride.requireOrDynamicImportModules, [
      ...REQUIRED_TRANSPORT_MODULES,
      ...REQUIRED_ROUTE_PERSISTENCE_MODULES,
    ])
  ) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js route override must restrict the exact transport and persistence module set.",
    );
  }
  if (
    !sameStringSet(
      routeOverride.staticImportPatterns,
      REQUIRED_ROUTE_CORE_PATTERNS,
    ) ||
    !sameStringSet(
      routeOverride.requireOrDynamicImportPatterns,
      REQUIRED_ROUTE_CORE_PATTERNS,
    )
  ) {
    pushViolation(
      violations,
      "lint-transport-binding",
      "eslint.config.js route override must reject database/realtime/auth/storage/logger/persistence import and require/dynamic-import patterns.",
    );
  }
}

function containsPreservedSubset(
  pinnedValue,
  actualValue,
  pathLabel,
  violations,
) {
  if (Array.isArray(pinnedValue)) {
    if (
      !Array.isArray(actualValue) ||
      actualValue.length < pinnedValue.length
    ) {
      pushViolation(
        violations,
        "expo-base-preservation",
        `Preserved Expo base array at ${pathLabel} is missing or truncated.`,
      );
      return;
    }
    const prefix = actualValue.slice(0, pinnedValue.length);
    if (!deepEqual(prefix, pinnedValue)) {
      pushViolation(
        violations,
        "expo-base-preservation",
        `Preserved Expo base array at ${pathLabel} does not match the pinned base as a leading prefix.`,
      );
    }
    return;
  }

  if (isPlainObject(pinnedValue)) {
    if (!isPlainObject(actualValue)) {
      pushViolation(
        violations,
        "expo-base-preservation",
        `Preserved Expo base object at ${pathLabel} is missing.`,
      );
      return;
    }
    for (const key of Object.keys(pinnedValue)) {
      containsPreservedSubset(
        pinnedValue[key],
        actualValue[key],
        `${pathLabel}.${key}`,
        violations,
      );
    }
    return;
  }

  if (actualValue !== pinnedValue) {
    pushViolation(
      violations,
      "expo-base-preservation",
      `Preserved Expo base value at ${pathLabel} was changed (expected ${JSON.stringify(pinnedValue)}, found ${JSON.stringify(actualValue)}).`,
    );
  }
}

function checkExpoBasePreservation(snapshot, violations) {
  const expoBase = isPlainObject(snapshot && snapshot.expoBase)
    ? snapshot.expoBase
    : {};
  const pinnedBase = expoBase.pinnedBase;
  const resolvedDevelopment = expoBase.resolvedDevelopment;

  if (!isPlainObject(pinnedBase) || !isPlainObject(resolvedDevelopment)) {
    pushViolation(
      violations,
      "expo-base-preservation",
      "expoBase.pinnedBase and expoBase.resolvedDevelopment are both required.",
    );
    return;
  }

  if (!deepEqual(pinnedBase, APPROVED_EXPO_BASE)) {
    pushViolation(
      violations,
      "expo-base-preservation",
      "src/core/config/expo-base-config.json must exactly equal expo_base_config_contract.pinned_base.",
    );
  }

  containsPreservedSubset(
    APPROVED_EXPO_BASE,
    resolvedDevelopment,
    "expoBase.resolvedDevelopment",
    violations,
  );

  if (resolvedDevelopment.name !== APPROVED_DEVELOPMENT_IDENTITY.name) {
    pushViolation(
      violations,
      "expo-base-preservation",
      `Development config name must be exactly ${JSON.stringify(APPROVED_DEVELOPMENT_IDENTITY.name)}.`,
    );
  }
  if (resolvedDevelopment.slug !== APPROVED_DEVELOPMENT_IDENTITY.slug) {
    pushViolation(
      violations,
      "expo-base-preservation",
      `Development config slug must be exactly ${JSON.stringify(APPROVED_DEVELOPMENT_IDENTITY.slug)}.`,
    );
  }
  const ios = isPlainObject(resolvedDevelopment.ios)
    ? resolvedDevelopment.ios
    : {};
  if (
    ios.bundleIdentifier !== APPROVED_DEVELOPMENT_IDENTITY.iosBundleIdentifier
  ) {
    pushViolation(
      violations,
      "expo-base-preservation",
      `Development config ios.bundleIdentifier must be exactly ${JSON.stringify(APPROVED_DEVELOPMENT_IDENTITY.iosBundleIdentifier)}.`,
    );
  }
  const android = isPlainObject(resolvedDevelopment.android)
    ? resolvedDevelopment.android
    : {};
  if (android.package !== APPROVED_DEVELOPMENT_IDENTITY.androidPackage) {
    pushViolation(
      violations,
      "expo-base-preservation",
      `Development config android.package must be exactly ${JSON.stringify(APPROVED_DEVELOPMENT_IDENTITY.androidPackage)}.`,
    );
  }

  const plugins = Array.isArray(resolvedDevelopment.plugins)
    ? resolvedDevelopment.plugins
    : [];
  const expectedPlugins = [
    ...APPROVED_EXPO_BASE.plugins,
    APPROVED_DEV_CLIENT_PLUGIN,
  ];
  if (!deepEqual(plugins, expectedPlugins)) {
    pushViolation(
      violations,
      "expo-base-preservation",
      'Development config plugins must equal the preserved base plugins followed by exactly ["expo-dev-client", { "addGeneratedScheme": true }].',
    );
  }

  const expectedIos = {
    ...APPROVED_EXPO_BASE.ios,
    bundleIdentifier: APPROVED_DEVELOPMENT_IDENTITY.iosBundleIdentifier,
  };
  if (!deepEqual(ios, expectedIos)) {
    pushViolation(
      violations,
      "expo-base-preservation",
      "Development config ios object contains missing or unapproved fields.",
    );
  }

  const expectedAndroid = {
    ...APPROVED_EXPO_BASE.android,
    package: APPROVED_DEVELOPMENT_IDENTITY.androidPackage,
    permissions: APPROVED_PREBUILD_ANDROID_PERMISSIONS,
  };
  if (!deepEqual(android, expectedAndroid)) {
    pushViolation(
      violations,
      "expo-base-preservation",
      "Development config android object contains missing or unapproved fields.",
    );
  }
}

function checkGeneratedNativeOutput(snapshot, violations) {
  const trackedPaths = Array.isArray(
    snapshot &&
      snapshot.generatedOutputs &&
      snapshot.generatedOutputs.trackedPaths,
  )
    ? snapshot.generatedOutputs.trackedPaths
    : [];

  if (trackedPaths.length > 0) {
    pushViolation(
      violations,
      "generated-native-output",
      `Generated/native output path(s) must never be tracked: ${trackedPaths.join(", ")}.`,
    );
  }

  const generatedOutputs = isPlainObject(snapshot && snapshot.generatedOutputs)
    ? snapshot.generatedOutputs
    : {};
  const inheritedClassification = isPlainObject(
    generatedOutputs.inheritedClassification,
  )
    ? generatedOutputs.inheritedClassification
    : {};
  for (const key of ["nodeModules", "expoDir", "expoEnvDts"]) {
    if (inheritedClassification[key] !== "ignored-untracked-unstaged") {
      pushViolation(
        violations,
        "generated-native-output",
        `Inherited generated output classification for ${key} must be ignored/untracked/unstaged.`,
      );
    }
  }

  for (const key of OPTIONAL_GENERATED_OUTPUT_CLASSIFICATIONS) {
    if (
      !["absent", "ignored-untracked-unstaged"].includes(
        inheritedClassification[key],
      )
    ) {
      pushViolation(
        violations,
        "generated-native-output",
        `Generated output classification for ${key} must be absent or ignored/untracked/unstaged.`,
      );
    }
  }

  const keystoreFiles = Array.isArray(generatedOutputs.keystoreFiles)
    ? generatedOutputs.keystoreFiles
    : [];
  const disallowedKeystoreFiles = keystoreFiles.filter(
    (file) => file !== SOLE_ALLOWED_GENERATED_KEYSTORE,
  );
  if (disallowedKeystoreFiles.length > 0) {
    pushViolation(
      violations,
      "generated-native-output",
      `Only ${SOLE_ALLOWED_GENERATED_KEYSTORE} may exist as a generated keystore/signing resource: ${disallowedKeystoreFiles.join(", ")}.`,
    );
  }
}

function checkVariantAndSecurity(snapshot, violations) {
  const resolvedDevelopment = isPlainObject(
    snapshot && snapshot.expoBase && snapshot.expoBase.resolvedDevelopment,
  )
    ? snapshot.expoBase.resolvedDevelopment
    : {};

  if (Object.prototype.hasOwnProperty.call(resolvedDevelopment, "scheme")) {
    pushViolation(
      violations,
      "variant-and-security",
      "The development variant must not declare a top-level (public/custom) scheme.",
    );
  }

  if (snapshot && snapshot.easJsonPresent === true) {
    pushViolation(
      violations,
      "variant-and-security",
      "eas.json must be absent from the repository.",
    );
  }

  const reservedPathsPresent = Array.isArray(
    snapshot && snapshot.reservedPathsPresent,
  )
    ? snapshot.reservedPathsPresent
    : [];
  if (reservedPathsPresent.length > 0) {
    pushViolation(
      violations,
      "variant-and-security",
      `Reserved M4+ or second-navigation-owner path(s) must remain absent: ${reservedPathsPresent.join(", ")}.`,
    );
  }
}

function checkSingleTestRunner(snapshot, violations) {
  const testRunnerDependencies = isPlainObject(
    snapshot && snapshot.testRunnerDependencies,
  )
    ? snapshot.testRunnerDependencies
    : {};

  if (
    testRunnerDependencies.hasVitest === true ||
    testRunnerDependencies.hasVitestConfig === true
  ) {
    pushViolation(
      violations,
      "single-test-runner",
      "Jest/jest-expo must be the sole test runner; Vitest dependency and/or config must be absent.",
    );
  }
}

/**
 * Pure policy validator. Accepts a plain-data repository snapshot and
 * returns { violations }. Performs no filesystem, process, or network
 * access, and never inspects TS/TSX source text.
 */
function checkArchitecture(snapshot) {
  const violations = [];

  checkExactScripts(snapshot, violations);
  checkJestExecution(snapshot, violations);
  checkCoverageContract(snapshot, violations);
  checkMeaningfulInventory(snapshot, violations);
  checkDependencyAndLockfile(snapshot, violations);
  checkLintTransportBinding(snapshot, violations);
  checkExpoBasePreservation(snapshot, violations);
  checkGeneratedNativeOutput(snapshot, violations);
  checkVariantAndSecurity(snapshot, violations);
  checkSingleTestRunner(snapshot, violations);

  return { violations };
}

// ---------------------------------------------------------------------------
// CLI-only: live repository snapshot construction and extra live checks.
// Nothing below this line executes unless this file is invoked directly
// (`node tools/quality/check-architecture.cjs`, i.e. bun run check:architecture).
// ---------------------------------------------------------------------------

function buildLiveSnapshot(
  root,
  {
    fs,
    path,
    crypto,
    execFileSync,
    gitTrackedPaths,
    expoResolution,
    eslintIntrospection,
  },
) {
  const packageJsonPath = path.join(root, "package.json");
  const packageJson = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
    : {};

  const jestConfigPath = path.join(root, "jest.config.js");
  let jestConfig = {};
  if (fs.existsSync(jestConfigPath)) {
    delete require.cache[require.resolve(jestConfigPath)];
    jestConfig = require(jestConfigPath);
  }

  const testInventoryViolations = [];
  const testInventory = discoverTestFiles(
    root,
    { fs, path },
    testInventoryViolations,
  );

  const bunLockExists = fs.existsSync(path.join(root, "bun.lock"));
  const foreignLockfilesPresent = FOREIGN_LOCKFILES.filter((name) =>
    fs.existsSync(path.join(root, name)),
  );
  const repositoryLockfiles = [
    ...(bunLockExists ? ["bun.lock"] : []),
    ...foreignLockfilesPresent,
  ];

  const expoBaseConfigPath = path.join(
    root,
    "src/core/config/expo-base-config.json",
  );
  const pinnedBase = fs.existsSync(expoBaseConfigPath)
    ? JSON.parse(fs.readFileSync(expoBaseConfigPath, "utf8"))
    : {};

  const generatedTrackedPaths = gitTrackedPaths.filter((trackedPath) =>
    GENERATED_OUTPUT_TRACKED_ROOTS.some(
      (generatedRoot) =>
        trackedPath === generatedRoot ||
        trackedPath.startsWith(`${generatedRoot}/`),
    ),
  );

  const devDependencies = isPlainObject(packageJson.devDependencies)
    ? packageJson.devDependencies
    : {};
  const dependencies = isPlainObject(packageJson.dependencies)
    ? packageJson.dependencies
    : {};
  const hasVitest = Boolean(devDependencies.vitest || dependencies.vitest);
  const vitestConfigCandidates = [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mjs",
    "vitest.config.cjs",
  ];
  const hasVitestConfig = vitestConfigCandidates.some((candidate) =>
    fs.existsSync(path.join(root, candidate)),
  );

  const formatScopeViolations = [];
  const mainEffectiveFiles = [
    ...new Set(
      FORMAT_SCOPE_MAIN_OPERANDS.flatMap((operand) =>
        expandFormatOperand(root, operand, { fs, path }, formatScopeViolations),
      ),
    ),
  ];

  const easJsonPresent = fs.existsSync(path.join(root, "eas.json"));
  const bunLockSha256 = computeFileSha256(
    { fs, crypto },
    path.join(root, "bun.lock"),
  );

  const inheritedClassification = {
    nodeModules: classifyInheritedOutput(
      { execFileSync, fs, path },
      root,
      "node_modules",
      gitTrackedPaths,
    ),
    expoDir: classifyInheritedOutput(
      { execFileSync, fs, path },
      root,
      ".expo",
      gitTrackedPaths,
    ),
    expoEnvDts: classifyInheritedOutput(
      { execFileSync, fs, path },
      root,
      "expo-env.d.ts",
      gitTrackedPaths,
    ),
    coverageDir: classifyOptionalGeneratedOutput(
      { execFileSync, fs, path },
      root,
      "coverage",
      gitTrackedPaths,
    ),
    iosDir: classifyOptionalGeneratedOutput(
      { execFileSync, fs, path },
      root,
      "ios",
      gitTrackedPaths,
    ),
    androidDir: classifyOptionalGeneratedOutput(
      { execFileSync, fs, path },
      root,
      "android",
      gitTrackedPaths,
    ),
  };
  const keystoreFiles = findSigningOrCredentialFiles(root, { fs, path });
  const reservedPathsPresent = RESERVED_DEFERRED_PATHS.filter((relativePath) =>
    fs.existsSync(path.join(root, relativePath)),
  );

  return {
    packageJson: {
      scripts: isPlainObject(packageJson.scripts) ? packageJson.scripts : {},
      dependencies,
      devDependencies,
      name: packageJson.name,
      main: packageJson.main,
      version: packageJson.version,
      private: packageJson.private,
      packageManager: packageJson.packageManager,
      topLevelKeys: Object.keys(packageJson),
    },
    jest: {
      preset: jestConfig.preset,
      roots: jestConfig.roots,
      passWithNoTests: jestConfig.passWithNoTests,
      coverageDirectory: jestConfig.coverageDirectory,
      collectCoverageFrom: jestConfig.collectCoverageFrom,
      coverageThreshold: jestConfig.coverageThreshold,
      coveragePathIgnorePatterns: jestConfig.coveragePathIgnorePatterns,
      testPathIgnorePatterns: jestConfig.testPathIgnorePatterns,
      modulePathIgnorePatterns: jestConfig.modulePathIgnorePatterns,
      watchPathIgnorePatterns: jestConfig.watchPathIgnorePatterns,
    },
    coverageRationale: {
      declarationNegativeGlob: COVERAGE_DECLARATION_RATIONALE,
      outOfDenominatorRunnerConfigs: COVERAGE_OUT_OF_DENOMINATOR_RATIONALE,
    },
    testInventory,
    repositoryLockfiles,
    bunLockSha256,
    easJsonPresent,
    reservedPathsPresent,
    eslintConfig: eslintIntrospection,
    expoBase: {
      pinnedBase,
      resolvedDevelopment:
        expoResolution && expoResolution.ok ? expoResolution.config : {},
    },
    formatScopes: {
      mainOperands: FORMAT_SCOPE_MAIN_OPERANDS,
      finalDocsOperands: FORMAT_SCOPE_FINAL_DOCS_OPERANDS,
      mainEffectiveFiles,
    },
    generatedOutputs: {
      trackedPaths: generatedTrackedPaths,
      inheritedClassification,
      keystoreFiles,
    },
    testRunnerDependencies: { hasVitest, hasVitestConfig },
    _formatScopeViolations: formatScopeViolations,
    _testInventoryViolations: testInventoryViolations,
  };
}

function ruleConfigOf(entry, ruleName) {
  return isPlainObject(entry) &&
    isPlainObject(entry.rules) &&
    ruleName in entry.rules
    ? entry.rules[ruleName]
    : undefined;
}

function ruleSeverityIsError(ruleConfig) {
  if (Array.isArray(ruleConfig))
    return ruleConfig[0] === "error" || ruleConfig[0] === 2;
  return ruleConfig === "error" || ruleConfig === 2;
}

function ruleOptionsOf(ruleConfig) {
  return Array.isArray(ruleConfig) && isPlainObject(ruleConfig[1])
    ? ruleConfig[1]
    : {};
}

function extractRestrictedGlobalNames(entry) {
  const ruleConfig = ruleConfigOf(entry, "no-restricted-globals");
  if (!Array.isArray(ruleConfig)) return [];
  return ruleConfig
    .slice(1)
    .map((item) =>
      typeof item === "string"
        ? item
        : isPlainObject(item)
          ? item.name
          : undefined,
    )
    .filter((name) => typeof name === "string");
}

function extractRestrictedPropertyPaths(entry) {
  const ruleConfig = ruleConfigOf(entry, "no-restricted-properties");
  if (!Array.isArray(ruleConfig)) return [];
  return ruleConfig
    .slice(1)
    .filter(
      (item) =>
        isPlainObject(item) &&
        typeof item.object === "string" &&
        typeof item.property === "string",
    )
    .map((item) => `${item.object}.${item.property}`);
}

function extractImportPathNames(entry) {
  const options = ruleOptionsOf(ruleConfigOf(entry, "no-restricted-imports"));
  const paths = Array.isArray(options.paths) ? options.paths : [];
  return paths
    .map((item) =>
      typeof item === "string"
        ? item
        : isPlainObject(item)
          ? item.name
          : undefined,
    )
    .filter((name) => typeof name === "string");
}

function extractImportPatternGroups(entry) {
  const options = ruleOptionsOf(ruleConfigOf(entry, "no-restricted-imports"));
  const patterns = Array.isArray(options.patterns) ? options.patterns : [];
  return patterns.flatMap((pattern) => {
    if (typeof pattern === "string") return [pattern];
    if (!isPlainObject(pattern) || !Array.isArray(pattern.group)) return [];
    return pattern.group.filter((group) => typeof group === "string");
  });
}

function extractRequirePatterns(entry) {
  const options = ruleOptionsOf(
    ruleConfigOf(entry, "local/no-restricted-transport-require"),
  );
  return Array.isArray(options.patterns) ? options.patterns : [];
}

function extractRequireModules(entry) {
  const options = ruleOptionsOf(
    ruleConfigOf(entry, "local/no-restricted-transport-require"),
  );
  return Array.isArray(options.modules) ? options.modules : [];
}

function findOverrideEntry(configArray, expectedFiles) {
  return Array.isArray(configArray)
    ? configArray.find(
        (entry) =>
          isPlainObject(entry) && sameStringSet(entry.files, expectedFiles),
      )
    : undefined;
}

function countOverrideEntries(configArray, expectedFiles) {
  return Array.isArray(configArray)
    ? configArray.filter(
        (entry) =>
          isPlainObject(entry) && sameStringSet(entry.files, expectedFiles),
      ).length
    : 0;
}

function extractOverride(configArray, expectedFiles) {
  const entry = findOverrideEntry(configArray, expectedFiles);
  const requireRuleConfig = ruleConfigOf(
    entry,
    "local/no-restricted-transport-require",
  );
  return {
    files: entry && Array.isArray(entry.files) ? entry.files : [],
    requireRuleEnabled: entry ? ruleSeverityIsError(requireRuleConfig) : false,
    staticImportModules: entry ? extractImportPathNames(entry) : [],
    requireOrDynamicImportModules: entry ? extractRequireModules(entry) : [],
    staticImportPatterns: entry ? extractImportPatternGroups(entry) : [],
    requireOrDynamicImportPatterns: entry ? extractRequirePatterns(entry) : [],
  };
}

function entryHasIgnoreOrDisabledRule(entry, ruleNames) {
  if (
    !isPlainObject(entry) ||
    (Array.isArray(entry.ignores) && entry.ignores.length > 0)
  )
    return true;
  return ruleNames.some(
    (ruleName) => !ruleSeverityIsError(ruleConfigOf(entry, ruleName)),
  );
}

function introspectEslintConfig(root, { fs, path }) {
  const eslintConfigPath = path.join(root, "eslint.config.js");
  if (!fs.existsSync(eslintConfigPath)) {
    return {
      usesExpoFlatConfig: false,
      transportEnforcedGlobs: [],
      forbidsCoverageIgnoreDirectives: false,
      screenOverride: {},
      routeOverride: {},
    };
  }

  delete require.cache[require.resolve(eslintConfigPath)];
  const configArray = require(eslintConfigPath);

  let usesExpoFlatConfig = false;
  try {
    const expoFlatConfig = require("eslint-config-expo/flat");
    usesExpoFlatConfig =
      Array.isArray(configArray) &&
      Array.isArray(expoFlatConfig) &&
      expoFlatConfig.some((entry) => configArray.includes(entry));
  } catch {
    usesExpoFlatConfig = false;
  }

  const transportEntry = Array.isArray(configArray)
    ? configArray.find(
        (entry) =>
          isPlainObject(entry) &&
          isPlainObject(entry.rules) &&
          "local/no-coverage-ignore-directives" in entry.rules,
      )
    : undefined;

  const transportEnforcedGlobs =
    transportEntry && Array.isArray(transportEntry.files)
      ? transportEntry.files
      : [];
  const forbidsCoverageIgnoreDirectives = transportEntry
    ? transportEntry.rules["local/no-coverage-ignore-directives"] === "error" ||
      (Array.isArray(
        transportEntry.rules["local/no-coverage-ignore-directives"],
      ) &&
        transportEntry.rules["local/no-coverage-ignore-directives"][0] ===
          "error")
    : false;

  const screenOverride = extractOverride(
    configArray,
    REQUIRED_SCREEN_FILES_GLOBS,
  );
  const routeOverride = extractOverride(
    configArray,
    REQUIRED_ROUTE_FILES_GLOBS,
  );

  const screenEntry = findOverrideEntry(
    configArray,
    REQUIRED_SCREEN_FILES_GLOBS,
  );
  const routeEntry = findOverrideEntry(configArray, REQUIRED_ROUTE_FILES_GLOBS);
  const hasBypassOrIgnoreState =
    countOverrideEntries(configArray, REQUIRED_TRANSPORT_GLOBS) !== 1 ||
    countOverrideEntries(configArray, REQUIRED_SCREEN_FILES_GLOBS) !== 1 ||
    countOverrideEntries(configArray, REQUIRED_ROUTE_FILES_GLOBS) !== 1 ||
    entryHasIgnoreOrDisabledRule(transportEntry, [
      "no-restricted-globals",
      "no-restricted-properties",
      "no-restricted-imports",
      "local/no-restricted-transport-require",
      "local/no-coverage-ignore-directives",
    ]) ||
    entryHasIgnoreOrDisabledRule(screenEntry, [
      "no-restricted-imports",
      "local/no-restricted-transport-require",
    ]) ||
    entryHasIgnoreOrDisabledRule(routeEntry, [
      "no-restricted-imports",
      "local/no-restricted-transport-require",
    ]);

  return {
    usesExpoFlatConfig,
    transportEnforcedGlobs,
    forbidsCoverageIgnoreDirectives,
    preventsInlineRuleBypass:
      transportEntry && isPlainObject(transportEntry.linterOptions)
        ? transportEntry.linterOptions.noInlineConfig === true
        : false,
    restrictedGlobalNames: transportEntry
      ? extractRestrictedGlobalNames(transportEntry)
      : [],
    restrictedPropertyPaths: transportEntry
      ? extractRestrictedPropertyPaths(transportEntry)
      : [],
    staticImportModules: transportEntry
      ? extractImportPathNames(transportEntry)
      : [],
    requireOrDynamicImportModules: transportEntry
      ? extractRequireModules(transportEntry)
      : [],
    hasBypassOrIgnoreState,
    screenOverride,
    routeOverride,
  };
}

function listGitTrackedPaths({ execFileSync }, root) {
  try {
    const output = execFileSync("git", ["ls-files"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function isGitIgnored({ execFileSync }, root, relativePath) {
  try {
    execFileSync("git", ["check-ignore", "-q", relativePath], {
      cwd: root,
      shell: false,
    });
    return true;
  } catch {
    return false;
  }
}

function classifyInheritedOutput(
  { execFileSync, fs, path },
  root,
  relativePath,
  gitTrackedPaths,
) {
  if (!fs.existsSync(path.join(root, relativePath))) return "absent";
  const tracked = gitTrackedPaths.some(
    (tracked_) =>
      tracked_ === relativePath || tracked_.startsWith(`${relativePath}/`),
  );
  const ignored = isGitIgnored({ execFileSync }, root, relativePath);
  return ignored && !tracked
    ? "ignored-untracked-unstaged"
    : "present-not-ignored-or-tracked";
}

function classifyOptionalGeneratedOutput(
  deps,
  root,
  relativePath,
  gitTrackedPaths,
) {
  if (!deps.fs.existsSync(deps.path.join(root, relativePath))) return "absent";
  return classifyInheritedOutput(deps, root, relativePath, gitTrackedPaths);
}

function computeGitStatusFingerprint({ execFileSync }, root) {
  try {
    return execFileSync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      {
        cwd: root,
        encoding: "utf8",
        shell: false,
      },
    );
  } catch {
    return null;
  }
}

function captureGeneratedOutputState(deps, root, gitTrackedPaths) {
  return {
    nodeModules: classifyInheritedOutput(
      deps,
      root,
      "node_modules",
      gitTrackedPaths,
    ),
    expoDir: classifyInheritedOutput(deps, root, ".expo", gitTrackedPaths),
    expoEnvDts: classifyInheritedOutput(
      deps,
      root,
      "expo-env.d.ts",
      gitTrackedPaths,
    ),
    coverageDir: classifyOptionalGeneratedOutput(
      deps,
      root,
      "coverage",
      gitTrackedPaths,
    ),
    iosDir: classifyOptionalGeneratedOutput(deps, root, "ios", gitTrackedPaths),
    androidDir: classifyOptionalGeneratedOutput(
      deps,
      root,
      "android",
      gitTrackedPaths,
    ),
  };
}

function captureAuthoredFileState({ fs, path, crypto }, root) {
  const guardedPaths = [
    ...new Set([
      ...AUTHORIZED_CREATE_OR_REPLACE_PATHS,
      ...AUTHORIZED_DELETE_PATHS,
      ...Object.keys(M1_M2_EVIDENCE_BASELINE_SHA256),
    ]),
  ].sort();
  const state = {};
  for (const relativePath of guardedPaths) {
    const fullPath = path.join(root, relativePath);
    if (!fs.existsSync(fullPath)) {
      state[relativePath] = { kind: "absent" };
      continue;
    }
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      state[relativePath] = { kind: "symlink" };
    } else if (stat.isFile()) {
      state[relativePath] = {
        kind: "file",
        sha256: computeFileSha256({ fs, crypto }, fullPath),
      };
    } else {
      state[relativePath] = {
        kind: stat.isDirectory() ? "directory" : "other",
      };
    }
  }
  return state;
}

function captureExpoMutationState(deps, root, gitTrackedPaths) {
  return {
    authoredFiles: captureAuthoredFileState(deps, root),
    generatedClassification: captureGeneratedOutputState(
      deps,
      root,
      gitTrackedPaths,
    ),
    gitStatus: computeGitStatusFingerprint(deps, root),
  };
}

function discoverTestFiles(root, { fs, path }, violations) {
  const testsRoot = path.join(root, "tests");
  if (!fs.existsSync(testsRoot)) return [];

  const results = [];
  const stack = ["tests"];
  const testFilePattern = /(?:^|\/)[^/]+\.(?:test|spec)\.(?:js|jsx|ts|tsx)$/;
  const supportedTestExtensionPattern = /\.(?:js|jsx|ts|tsx)$/;
  while (stack.length > 0) {
    const current = stack.pop();
    const currentFull = path.join(root, current);
    let entries;
    try {
      entries = fs.readdirSync(currentFull).sort();
    } catch {
      pushViolation(
        violations,
        "meaningful-inventory",
        `Unable to read test inventory directory: ${current}.`,
      );
      continue;
    }
    for (const entryName of entries) {
      const entryRelative = `${current}/${entryName}`;
      const entryFull = path.join(root, entryRelative);
      let entryStat;
      try {
        entryStat = fs.lstatSync(entryFull);
      } catch {
        pushViolation(
          violations,
          "meaningful-inventory",
          `Unable to inspect test inventory path: ${entryRelative}.`,
        );
        continue;
      }
      if (entryStat.isSymbolicLink()) {
        pushViolation(
          violations,
          "meaningful-inventory",
          `Test inventory path must not be a symlink: ${entryRelative}.`,
        );
      } else if (entryStat.isDirectory()) {
        stack.push(entryRelative);
      } else if (entryStat.isFile()) {
        const isJestTest =
          testFilePattern.test(entryRelative) ||
          (entryRelative.split("/").includes("__tests__") &&
            supportedTestExtensionPattern.test(entryRelative) &&
            !entryRelative.endsWith(".d.ts"));
        if (isJestTest) results.push(entryRelative);
      }
    }
  }
  return results.sort();
}

function expandFormatOperand(root, operand, { fs, path }, violations) {
  const fullPath = path.join(root, operand);
  let stat;
  try {
    stat = fs.lstatSync(fullPath);
  } catch {
    pushViolation(
      violations,
      "format-scope",
      `format:check operand does not exist on disk: ${operand}.`,
    );
    return [];
  }
  if (stat.isSymbolicLink()) {
    pushViolation(
      violations,
      "format-scope",
      `format:check operand ${operand} must not be a symlink (no symlink escape).`,
    );
    return [];
  }
  if (stat.isFile()) {
    return PRETTIER_SUPPORTED_EXTENSIONS.has(
      path.extname(operand).toLowerCase(),
    )
      ? [operand]
      : [];
  }
  if (!stat.isDirectory()) return [];

  const results = [];
  const stack = [operand];
  while (stack.length > 0) {
    const current = stack.pop();
    const currentFull = path.join(root, current);
    for (const entryName of fs.readdirSync(currentFull).sort()) {
      const entryRelative = `${current}/${entryName}`;
      const entryFull = path.join(root, entryRelative);
      const entryStat = fs.lstatSync(entryFull);
      if (entryStat.isSymbolicLink()) {
        pushViolation(
          violations,
          "format-scope",
          `format:check effective file ${entryRelative} must not be a symlink (no symlink escape).`,
        );
        continue;
      }
      if (entryStat.isDirectory()) {
        stack.push(entryRelative);
      } else if (
        entryStat.isFile() &&
        PRETTIER_SUPPORTED_EXTENSIONS.has(
          path.extname(entryRelative).toLowerCase(),
        )
      ) {
        results.push(entryRelative);
      }
    }
  }
  return results.sort();
}

function findSigningOrCredentialFiles(root, { fs, path }) {
  const matches = [];
  const stack = [""];
  const skippedDirectories = new Set([
    ".git",
    "node_modules",
    ".expo",
    "coverage",
  ]);
  while (stack.length > 0) {
    const current = stack.pop();
    const currentFull = path.join(root, current);
    let entries;
    try {
      entries = fs.readdirSync(currentFull);
    } catch {
      continue;
    }
    for (const name of entries.sort()) {
      if (skippedDirectories.has(name)) continue;
      const relative = current === "" ? name : `${current}/${name}`;
      const full = path.join(root, relative);
      let entryStat;
      try {
        entryStat = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (entryStat.isSymbolicLink()) {
        if (SIGNING_OR_CREDENTIAL_FILE_PATTERN.test(relative))
          matches.push(relative);
        continue;
      }
      if (entryStat.isDirectory()) {
        stack.push(relative);
        continue;
      }
      if (SIGNING_OR_CREDENTIAL_FILE_PATTERN.test(relative)) {
        matches.push(relative);
      }
    }
  }
  return matches.sort();
}

function findTutorialAssetReferences(root, { fs, path }) {
  const references = [];
  const violations = [];

  function inspectFile(relativePath) {
    if (
      !TUTORIAL_REFERENCE_EXTENSIONS.has(
        path.extname(relativePath).toLowerCase(),
      )
    )
      return;
    let contents;
    try {
      contents = fs.readFileSync(path.join(root, relativePath), "utf8");
    } catch {
      pushViolation(
        violations,
        "tutorial-asset-reference",
        `Unable to read reference-search path: ${relativePath}.`,
      );
      return;
    }
    const classification = classifyTutorialAssetReferencesInText(
      relativePath,
      contents,
    );
    if (
      relativePath === TUTORIAL_POLICY_CHECKER_PATH &&
      classification.policyDeclarationCount !== 1
    ) {
      pushViolation(
        violations,
        "tutorial-asset-reference",
        `Architecture checker must contain exactly one standalone tutorial-asset delete-policy declaration; found ${classification.policyDeclarationCount}.`,
      );
    }
    if (classification.hasUnapprovedReference) references.push(relativePath);
  }

  const stack = [];
  for (const relativePath of TUTORIAL_REFERENCE_SCAN_ROOTS) {
    const fullPath = path.join(root, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      pushViolation(
        violations,
        "tutorial-asset-reference",
        `Reference-search root must not be a symlink: ${relativePath}.`,
      );
    } else if (stat.isFile()) {
      inspectFile(relativePath);
    } else if (stat.isDirectory()) {
      stack.push(relativePath);
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(path.join(root, current)).sort();
    for (const name of entries) {
      const relativePath = `${current}/${name}`;
      const stat = fs.lstatSync(path.join(root, relativePath));
      if (stat.isSymbolicLink()) {
        pushViolation(
          violations,
          "tutorial-asset-reference",
          `Reference-search path must not be a symlink: ${relativePath}.`,
        );
      } else if (stat.isDirectory()) {
        stack.push(relativePath);
      } else if (stat.isFile()) {
        inspectFile(relativePath);
      }
    }
  }

  return { references: references.sort(), violations };
}

function computeFileSha256({ fs, crypto }, filePath) {
  if (!fs.existsSync(filePath)) return null;
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function resolveLiveExpoConfig({ execFileSync }, root) {
  try {
    const childEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      APP_VARIANT: "development",
      EXPO_PUBLIC_APP_MODE: "local-fixture",
    };
    const output = execFileSync(
      "./node_modules/.bin/expo",
      ["config", "--type", "prebuild", "--json"],
      {
        cwd: root,
        encoding: "utf8",
        shell: false,
        env: childEnv,
      },
    );
    return { ok: true, config: JSON.parse(output) };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function runExtraLiveChecks(root, { fs, path, crypto }, liveSnapshot) {
  const violations = [];

  const appConfigPath = path.join(root, "app.config.ts");
  const legacyAppJsonPath = path.join(root, "app.json");
  if (!fs.existsSync(appConfigPath)) {
    pushViolation(
      violations,
      "single-manifest",
      "app.config.ts must exist as the sole Expo config entry point.",
    );
  }
  if (fs.existsSync(legacyAppJsonPath)) {
    pushViolation(
      violations,
      "single-manifest",
      "app.json must be removed; app.config.ts is the sole Expo manifest.",
    );
  }

  const gitignorePath = path.join(root, ".gitignore");
  const gitignoreContents = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";
  const gitignoreSha256 = computeFileSha256({ fs, crypto }, gitignorePath);
  if (gitignoreSha256 !== APPROVED_GITIGNORE_SHA256) {
    pushViolation(
      violations,
      "ignored-generated-output",
      `.gitignore must equal the approved M3-Q0 one-line /coverage/ append (sha256 ${APPROVED_GITIGNORE_SHA256}).`,
    );
  }
  for (const requiredEntry of [
    "/coverage/",
    "/ios",
    "/android",
    ".expo/",
    "expo-env.d.ts",
    "node_modules/",
  ]) {
    if (
      !gitignoreContents
        .split("\n")
        .some((line) => line.trim() === requiredEntry)
    ) {
      pushViolation(
        violations,
        "ignored-generated-output",
        `.gitignore is missing the required entry ${requiredEntry}.`,
      );
    }
  }

  const rawPackageJsonPath = path.join(root, "package.json");
  const rawPackageJson = fs.existsSync(rawPackageJsonPath)
    ? JSON.parse(fs.readFileSync(rawPackageJsonPath, "utf8"))
    : {};
  const devDependencies = isPlainObject(rawPackageJson.devDependencies)
    ? rawPackageJson.devDependencies
    : {};
  const dependencies = isPlainObject(rawPackageJson.dependencies)
    ? rawPackageJson.dependencies
    : {};
  const allDirectDependencyNames = new Set([
    ...Object.keys(dependencies),
    ...Object.keys(devDependencies),
  ]);

  for (const denied of DIRECT_DEPENDENCY_DENYLIST) {
    if (denied.endsWith("/*")) {
      const scopePrefix = denied.slice(0, -1);
      for (const name of allDirectDependencyNames) {
        if (name.startsWith(scopePrefix)) {
          pushViolation(
            violations,
            "manifest-field-ownership",
            `Denylisted direct dependency present: ${name}.`,
          );
        }
      }
    } else if (allDirectDependencyNames.has(denied)) {
      pushViolation(
        violations,
        "manifest-field-ownership",
        `Denylisted direct dependency present: ${denied}.`,
      );
    }
  }

  for (const requiredAbsent of REQUIRED_ABSENT_DEMO_DIRECT_DEPENDENCIES) {
    if (allDirectDependencyNames.has(requiredAbsent)) {
      pushViolation(
        violations,
        "manifest-field-ownership",
        `Demo-only direct dependency must remain absent: ${requiredAbsent}.`,
      );
    }
  }

  if (
    rawPackageJson.scripts &&
    Object.prototype.hasOwnProperty.call(
      rawPackageJson.scripts,
      "reset-project",
    )
  ) {
    pushViolation(
      violations,
      "exact-scripts",
      "package.json scripts.reset-project must be removed by M3-Q0.",
    );
  }

  for (const relativePath of REQUIRED_PRE_QUALITY_PATHS) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      pushViolation(
        violations,
        "file-change-policy",
        `Required pre-quality authored path is absent: ${relativePath}.`,
      );
    }
  }

  for (const relativePath of AUTHORIZED_DELETE_PATHS) {
    if (fs.existsSync(path.join(root, relativePath))) {
      pushViolation(
        violations,
        "file-change-policy",
        `Exact M3 delete-list path is still present: ${relativePath}.`,
      );
    }
  }

  const tutorialReferences = findTutorialAssetReferences(root, { fs, path });
  violations.push(...tutorialReferences.violations);
  if (tutorialReferences.references.length > 0) {
    pushViolation(
      violations,
      "tutorial-asset-reference",
      `Surviving M3 config/source/test/tool reference(s) to ${TUTORIAL_ASSET_PATH}: ${tutorialReferences.references.join(", ")}.`,
    );
  }

  for (const [relativePath, approvedSha256] of Object.entries(
    M1_M2_EVIDENCE_BASELINE_SHA256,
  )) {
    const actualSha256 = computeFileSha256(
      { fs, crypto },
      path.join(root, relativePath),
    );
    if (actualSha256 !== approvedSha256) {
      pushViolation(
        violations,
        "exact-scripts",
        `${relativePath} must remain byte-identical to its baseline (sha256 ${approvedSha256}).`,
      );
    }
  }

  for (const [relativePath, approvedSha256] of Object.entries(
    APPROVED_RECOVERY_FILE_SHA256,
  )) {
    const actualSha256 = computeFileSha256(
      { fs, crypto },
      path.join(root, relativePath),
    );
    if (actualSha256 !== approvedSha256) {
      pushViolation(
        violations,
        "working-tree-allowlist",
        `${relativePath} must equal the exact user-approved TSC recovery (sha256 ${approvedSha256}).`,
      );
    }
  }

  if (fs.existsSync(path.join(root, "eas.json"))) {
    pushViolation(
      violations,
      "variant-and-security",
      "eas.json must be absent from the repository.",
    );
  }

  return violations;
}

function checkWorkingTreeAllowlist(root, { execFileSync }) {
  const violations = [];
  let statusOutput;
  try {
    statusOutput = execFileSync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      {
        cwd: root,
        encoding: "utf8",
        shell: false,
      },
    );
  } catch (error) {
    pushViolation(
      violations,
      "working-tree-allowlist",
      `Unable to inspect the complete working tree: ${error && error.message ? error.message : String(error)}.`,
    );
    return violations;
  }

  const records = statusOutput.split("\0");
  const changedPaths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    changedPaths.push(record.slice(3));
    if (/[RC]/.test(status)) {
      const originalPath = records[index + 1];
      if (originalPath) changedPaths.push(originalPath);
      index += 1;
    }
  }

  for (const changedPath of changedPaths) {
    if (!isAuthorizedWorkingTreePath(changedPath)) {
      pushViolation(
        violations,
        "working-tree-allowlist",
        `Working-tree change outside the file_change_policy authored/create/delete allowlist: ${changedPath}.`,
      );
    }
  }

  return violations;
}

function formatReport(result) {
  if (result.violations.length === 0) {
    return "check-architecture: PASS (0 violations)";
  }
  const lines = result.violations.map(
    (violation, index) =>
      `${index + 1}. [${violation.category}] ${violation.message}`,
  );
  return `check-architecture: FAIL (${result.violations.length} violation(s))\n${lines.join("\n")}`;
}

function main() {
  const fs = require("node:fs");
  const path = require("node:path");
  const crypto = require("node:crypto");
  const { execFileSync } = require("node:child_process");

  const root = process.cwd();
  const gitTrackedPaths = listGitTrackedPaths({ execFileSync }, root);
  const eslintIntrospection = introspectEslintConfig(root, { fs, path });

  const preExpoMutationState = captureExpoMutationState(
    { execFileSync, fs, path, crypto },
    root,
    gitTrackedPaths,
  );
  const expoResolution = resolveLiveExpoConfig({ execFileSync }, root);
  const postExpoMutationState = captureExpoMutationState(
    { execFileSync, fs, path, crypto },
    root,
    gitTrackedPaths,
  );

  const liveSnapshot = buildLiveSnapshot(root, {
    fs,
    path,
    crypto,
    execFileSync,
    gitTrackedPaths,
    expoResolution,
    eslintIntrospection,
  });
  const formatScopeViolations = liveSnapshot._formatScopeViolations || [];
  const testInventoryViolations = liveSnapshot._testInventoryViolations || [];
  delete liveSnapshot._formatScopeViolations;
  delete liveSnapshot._testInventoryViolations;

  const policyResult = checkArchitecture(liveSnapshot);
  const extraViolations = runExtraLiveChecks(
    root,
    { fs, path, crypto },
    liveSnapshot,
  );
  const workingTreeViolations = checkWorkingTreeAllowlist(root, {
    execFileSync,
  });
  const combined = {
    violations: [
      ...policyResult.violations,
      ...extraViolations,
      ...workingTreeViolations,
      ...formatScopeViolations,
      ...testInventoryViolations,
    ],
  };

  if (!expoResolution.ok) {
    pushViolation(
      combined.violations,
      "expo-base-preservation",
      `Live Expo config resolution failed: ${expoResolution.error}`,
    );
  }

  if (!deepEqual(preExpoMutationState, postExpoMutationState)) {
    pushViolation(
      combined.violations,
      "expo-base-preservation",
      "Local Expo config resolution must not mutate authored files, git status, or generated-output classification.",
    );
  }

  console.log(formatReport(combined));
  process.exitCode = combined.violations.length === 0 ? 0 : 1;
}

module.exports = {
  checkArchitecture,
  classifyTutorialAssetReferencesInText,
  isAuthorizedWorkingTreePath,
  EXACT_PACKAGE_SCRIPTS,
  COVERAGE_COLLECT_FROM,
  GLOBAL_COVERAGE_THRESHOLD,
  MEANINGFUL_TEST_PATHS,
  REQUIRED_TRANSPORT_GLOBS,
  FOREIGN_LOCKFILES,
};

if (require.main === module) {
  main();
}
