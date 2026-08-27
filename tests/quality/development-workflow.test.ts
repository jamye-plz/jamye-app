type PackageManifest = {
  scripts: Record<string, string>;
};

const EXPECTED_SCRIPT_NAMES = [
  "typecheck",
  "lint",
  "format:check",
  "format:write",
  "test",
  "test:watch",
  "test:coverage",
  "check:architecture",
  "check:code",
  "deps:install:frozen",
  "toolchain:flake",
  "toolchain:check",
  "toolchain:check:native",
  "check:toolchain",
  "android:gradle:stop",
  "android:avd:verify",
  "android:avd:create",
  "android:avd:reconcile",
  "android:avd:start",
  "android:avd:stop",
  "expo:install:check",
  "expo:doctor",
  "check:expo",
  "expo:start",
  "expo:prebuild:clean",
  "expo:run:ios",
  "expo:run:android",
  "check",
] as const;

function readRepositoryFile(relativePath: string): string {
  const { readFileSync } = jest.requireActual("node:fs") as {
    readFileSync: (path: string, encoding: "utf8") => string;
  };
  return readFileSync(`${process.cwd()}/${relativePath}`, "utf8");
}

describe("development workflow contract", () => {
  test("exposes one documented Bun entrypoint for each approved workflow", () => {
    const manifest = JSON.parse(
      readRepositoryFile("package.json"),
    ) as PackageManifest;

    expect(Object.keys(manifest.scripts).sort()).toEqual(
      [...EXPECTED_SCRIPT_NAMES].sort(),
    );
    expect(manifest.scripts.ios).toBeUndefined();
    expect(manifest.scripts.android).toBeUndefined();
  });

  test("loads application configuration from dotenv files instead of script prefixes", () => {
    const manifest = JSON.parse(
      readRepositoryFile("package.json"),
    ) as PackageManifest;
    const example = readRepositoryFile(".env.example");
    const jestConfig = readRepositoryFile("jest.config.js");
    const jestEnvLoader = readRepositoryFile("tools/quality/jest-env.cjs");

    for (const command of Object.values(manifest.scripts)) {
      expect(command).not.toMatch(/(?:^|\s)APP_VARIANT=/u);
      expect(command).not.toMatch(/(?:^|\s)EXPO_PUBLIC_APP_MODE=/u);
    }
    expect(manifest.scripts.test).toBe("jest");
    expect(manifest.scripts["test:watch"]).toBe("jest --watch");
    expect(manifest.scripts["test:coverage"]).toBe(
      "jest --coverage --runInBand",
    );
    expect(jestConfig).toContain(
      'globalSetup: "<rootDir>/tools/quality/jest-env.cjs"',
    );
    expect(jestConfig).not.toContain("setupFiles:");
    expect(jestEnvLoader).toContain("module.exports = function");
    expect(jestEnvLoader).toContain("process.loadEnvFile");
    expect(jestEnvLoader).toContain('path.resolve(__dirname, "../..", ".env")');
    expect(example).toContain("APP_VARIANT=development");
    expect(example).toContain("EXPO_PUBLIC_APP_MODE=local-fixture");
  });

  test("keeps format writes path-scoped and separates checks from state-changing commands", () => {
    const manifest = JSON.parse(
      readRepositoryFile("package.json"),
    ) as PackageManifest;

    expect(manifest.scripts["format:check"]).toBe("prettier --check .");
    expect(manifest.scripts["format:write"]).toBe("prettier --write");
    expect(manifest.scripts["format:check:final-docs"]).toBeUndefined();
    expect(manifest.scripts.lint).toBe(
      'eslint "*.{js,cjs,mjs,ts,tsx}" src tests tools',
    );
    expect(manifest.scripts["android:gradle:stop"]).toBe(
      "./android/gradlew --stop",
    );
    expect(manifest.scripts.check).not.toMatch(
      /(?:prebuild|run:ios|run:android|android:gradle:stop|avd:(?:create|reconcile|start|stop))/u,
    );
    expect(manifest.scripts["check:toolchain"]).not.toContain(
      "android:gradle:stop",
    );
    expect(manifest.scripts["toolchain:check:native"]).not.toMatch(
      /(?:gradlew|android:gradle:stop)/u,
    );
    expect(manifest.scripts["check:code"]).toContain("test:coverage");
  });

  test("keeps the Expo dependency check non-interactive and non-installing", () => {
    const manifest = JSON.parse(
      readRepositoryFile("package.json"),
    ) as PackageManifest;

    expect(manifest.scripts["expo:install:check"]).toBe(
      "CI=1 expo install --check",
    );
    expect(manifest.scripts["expo:install:check"]).not.toMatch(
      /(?:--fix|bun add|bun install|expo install --fix)/u,
    );
    expect(manifest.scripts["check:expo"]).toBe(
      "bun run expo:install:check && bun run expo:doctor",
    );
  });

  test("documents every script, its environment source, and version authorities", () => {
    const { existsSync } = jest.requireActual("node:fs") as {
      existsSync: (path: string) => boolean;
    };
    const workflowPath = `${process.cwd()}/docs/development-workflow.md`;

    expect(existsSync(workflowPath)).toBe(true);
    if (!existsSync(workflowPath)) return;

    const workflow = readRepositoryFile("docs/development-workflow.md");
    const readme = readRepositoryFile("README.md");
    const prettierIgnore = readRepositoryFile(".prettierignore");

    for (const scriptName of EXPECTED_SCRIPT_NAMES) {
      expect(workflow).toContain(`bun run ${scriptName}`);
    }
    expect(workflow).toContain(".env.example");
    expect(workflow).toContain(".env");
    expect(workflow).toContain("tools/quality/jest-env.cjs");
    expect(workflow).toContain("nix/toolchain-versions.nix");
    expect(workflow).toContain("package.json");
    expect(workflow).toContain(".prettierignore");
    expect(workflow).toContain(
      'eslint "*.{js,cjs,mjs,ts,tsx}" src tests tools',
    );
    expect(workflow).toContain("GRADLE_USER_HOME");
    expect(workflow).toContain("CI=1 expo install --check");
    expect(workflow).toContain("호환 version을 설치하지 않는다");
    expect(workflow).toContain(
      "Gradle daemon 복구 중에는 project AVD와 Emulator를 종료하지 않는다.",
    );
    expect(workflow).toContain("읽기 전용");
    expect(workflow).toContain("상태 변경");
    expect(workflow).toContain("장시간 실행");
    expect(workflow).toContain("build");
    const prettierIgnoreEntries = prettierIgnore
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .sort();
    expect(prettierIgnoreEntries).toEqual(
      [
        ".agents/",
        ".antigravitycli/",
        ".claude/",
        ".codex/",
        ".expo/",
        ".mcp.json",
        ".migration-backup/",
        ".qwen/",
        ".serena/",
        "AGENTS.md",
        "CLAUDE.md",
        "android/",
        "assets/",
        "coverage/",
        "dist/",
        "docs/evidence/",
        "expo-env.d.ts",
        "ios/",
        "node_modules/",
        "tsconfig.json",
        "web-build/",
      ].sort(),
    );
    expect(readme).toContain("docs/development-workflow.md");
  });
});
