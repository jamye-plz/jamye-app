type PublicAppMode = "local-fixture";
type PublicEnv = Readonly<{ appMode: PublicAppMode }>;
type PublicEnvModule = {
  parsePublicAppMode?: unknown;
  getPublicEnv?: unknown;
};

type ParsePublicAppMode = (value: string | undefined) => PublicAppMode;
type GetPublicEnv = () => PublicEnv;

const INITIAL_PUBLIC_APP_MODE = process.env.EXPO_PUBLIC_APP_MODE;

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

function loadPublicEnvModule(): {
  parsePublicAppMode: ParsePublicAppMode;
  getPublicEnv: GetPublicEnv;
} {
  let loaded: PublicEnvModule;
  try {
    loaded = jest.requireActual<PublicEnvModule>(
      "../../src/core/config/public-env",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M3-I1 implementation missing: src/core/config/public-env.ts must exist before GREEN.",
      );
    }
    throw error;
  }

  if (
    typeof loaded.parsePublicAppMode !== "function" ||
    typeof loaded.getPublicEnv !== "function"
  ) {
    throw new Error(
      "M3-I1 implementation incomplete: public-env.ts must export parsePublicAppMode() and getPublicEnv().",
    );
  }

  return {
    parsePublicAppMode: loaded.parsePublicAppMode as ParsePublicAppMode,
    getPublicEnv: loaded.getPublicEnv as GetPublicEnv,
  };
}

function captureError(operation: () => unknown): Error {
  try {
    operation();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error(
    "Expected strict EXPO_PUBLIC_APP_MODE validation to reject this value.",
  );
}

afterEach(() => {
  if (INITIAL_PUBLIC_APP_MODE === undefined) {
    delete process.env.EXPO_PUBLIC_APP_MODE;
  } else {
    process.env.EXPO_PUBLIC_APP_MODE = INITIAL_PUBLIC_APP_MODE;
  }
  jest.resetModules();
});

describe("M3-I1 public environment contract", () => {
  test("pure parser accepts only the exact local-fixture literal", () => {
    const { parsePublicAppMode } = loadPublicEnvModule();

    expect(parsePublicAppMode("local-fixture")).toBe("local-fixture");
  });

  test("pure parser rejects a missing value with an actionable message", () => {
    const { parsePublicAppMode } = loadPublicEnvModule();
    const error = captureError(() => parsePublicAppMode(undefined));

    expect(error.message).toMatch(/EXPO_PUBLIC_APP_MODE/i);
    expect(error.message).toMatch(/missing|required/i);
    expect(error.message).toMatch(/local-fixture/i);
  });

  test("pure parser rejects unsupported input without echoing the supplied value", () => {
    const { parsePublicAppMode } = loadPublicEnvModule();
    const secretLikeSentinel = "do-not-echo-runtime-value";
    const error = captureError(() => parsePublicAppMode(secretLikeSentinel));

    expect(error.message).toMatch(/EXPO_PUBLIC_APP_MODE/i);
    expect(error.message).toMatch(/unsupported|invalid/i);
    expect(error.message).toMatch(/local-fixture/i);
    expect(error.message).not.toContain(secretLikeSentinel);
  });

  test("typed accessor validates the static EXPO_PUBLIC_APP_MODE input before returning config", () => {
    process.env.EXPO_PUBLIC_APP_MODE = "local-fixture";
    jest.resetModules();
    const { getPublicEnv } = loadPublicEnvModule();

    expect(getPublicEnv()).toEqual({ appMode: "local-fixture" });
  });

  test("typed accessor surfaces the controlled validation path for an unsupported startup value", () => {
    const secretLikeSentinel = "do-not-echo-startup-value";
    process.env.EXPO_PUBLIC_APP_MODE = secretLikeSentinel;
    jest.resetModules();

    const error = captureError(() => loadPublicEnvModule().getPublicEnv());

    expect(error.message).toMatch(/EXPO_PUBLIC_APP_MODE/i);
    expect(error.message).toMatch(/unsupported|invalid/i);
    expect(error.message).not.toContain(secretLikeSentinel);
  });
});
