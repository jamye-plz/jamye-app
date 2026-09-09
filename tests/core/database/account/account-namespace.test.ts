type NamespaceModule = {
  resolveAccountDatabaseFilename?: unknown;
};

type ResolveAccountDatabaseFilename = (
  principal: Readonly<{ origin: string; userId: string }>,
) => Promise<string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error.code === "MODULE_NOT_FOUND" ||
      (typeof error.message === "string" &&
        error.message.includes("Cannot find module")))
  );
}

function loadNamespaceContract(): {
  resolveAccountDatabaseFilename: ResolveAccountDatabaseFilename;
} {
  let module: NamespaceModule;
  try {
    module = jest.requireActual<NamespaceModule>(
      "../../../../src/core/database/account/namespace",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M6-03 implementation missing: src/core/database/account/namespace.ts must export resolveAccountDatabaseFilename().",
      );
    }
    throw error;
  }

  if (typeof module.resolveAccountDatabaseFilename !== "function") {
    throw new Error(
      "M6-03 namespace contract is incomplete: resolveAccountDatabaseFilename() must be exported.",
    );
  }

  return {
    resolveAccountDatabaseFilename:
      module.resolveAccountDatabaseFilename as ResolveAccountDatabaseFilename,
  };
}

const VALID_USER_ID = "a1b2c3d4-e5f6-47a8-99b0-1234567890ab";
const OTHER_VALID_USER_ID = "ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb";

function mockDigest(implementation: (data: string) => string): void {
  jest.doMock("expo-crypto", () => ({
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { HEX: "hex" },
    digestStringAsync: jest.fn(async (_algorithm: unknown, data: string) =>
      implementation(data),
    ),
  }));
}

function syntheticHexDigest(data: string): string {
  let hash = 0;
  for (let index = 0; index < data.length; index += 1) {
    hash = (Math.imul(hash, 31) + data.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(64, "0").slice(0, 64);
}

describe("M6-03 deterministic account namespace resolution", () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("expo-crypto");
  });

  test("resolves the same filename for the same normalized origin and validated user UUID", async () => {
    mockDigest(syntheticHexDigest);
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    const first = await resolveAccountDatabaseFilename({
      origin: "https://api.jamye.example",
      userId: VALID_USER_ID,
    });
    const second = await resolveAccountDatabaseFilename({
      origin: "https://api.jamye.example",
      userId: VALID_USER_ID,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^jamye-account-v1-[0-9a-f]{64}\.db$/);
  });

  test("resolves different filenames for different origins with the same user UUID", async () => {
    mockDigest(syntheticHexDigest);
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    const a = await resolveAccountDatabaseFilename({
      origin: "https://api.jamye.example",
      userId: VALID_USER_ID,
    });
    const b = await resolveAccountDatabaseFilename({
      origin: "https://staging.jamye.example",
      userId: VALID_USER_ID,
    });

    expect(a).not.toBe(b);
  });

  test("resolves different filenames for different user UUIDs with the same origin", async () => {
    mockDigest(syntheticHexDigest);
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    const a = await resolveAccountDatabaseFilename({
      origin: "https://api.jamye.example",
      userId: VALID_USER_ID,
    });
    const b = await resolveAccountDatabaseFilename({
      origin: "https://api.jamye.example",
      userId: OTHER_VALID_USER_ID,
    });

    expect(a).not.toBe(b);
  });

  test("rejects a user id that is not a validated UUID, including path-traversal payloads", async () => {
    mockDigest(syntheticHexDigest);
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    await expect(
      resolveAccountDatabaseFilename({
        origin: "https://api.jamye.example",
        userId: "../../../etc/passwd",
      }),
    ).rejects.toThrow(/uuid/i);
    await expect(
      resolveAccountDatabaseFilename({
        origin: "https://api.jamye.example",
        userId: "",
      }),
    ).rejects.toThrow(/uuid/i);
  });

  test("rejects an empty or non-normalized origin", async () => {
    mockDigest(syntheticHexDigest);
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    await expect(
      resolveAccountDatabaseFilename({ origin: "", userId: VALID_USER_ID }),
    ).rejects.toThrow(/origin/i);
    await expect(
      resolveAccountDatabaseFilename({
        origin: " https://api.jamye.example ",
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/origin/i);
    await expect(
      resolveAccountDatabaseFilename({
        origin: "https://api.jamye.example\n/../../x",
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/origin/i);
  });

  test("rejects an origin that carries a path, query, or credentials instead of a bare HTTPS origin", async () => {
    mockDigest(syntheticHexDigest);
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    await expect(
      resolveAccountDatabaseFilename({
        origin: "https://api.jamye.example/v1",
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/origin/i);
    await expect(
      resolveAccountDatabaseFilename({
        origin: "https://api.jamye.example?token=abc",
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/origin/i);
    await expect(
      resolveAccountDatabaseFilename({
        origin: "https://user:pass@api.jamye.example",
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/origin/i);
  });

  test("rejects a non-HTTPS origin", async () => {
    mockDigest(syntheticHexDigest);
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    await expect(
      resolveAccountDatabaseFilename({
        origin: "http://api.jamye.example",
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/origin/i);
  });

  test("rejects an origin string that only normalizes to a canonical origin instead of already being one", async () => {
    mockDigest(syntheticHexDigest);
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    // The canonical parser would silently lowercase this host and accept it;
    // requiring equality with its normalized output must reject it instead,
    // so the exact string used for the filename and for the persisted
    // metadata identity never diverge from what was actually requested.
    await expect(
      resolveAccountDatabaseFilename({
        origin: "https://API.jamye.example",
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/origin/i);
  });

  test("accepts a bare canonical HTTPS origin and produces a stable filename", async () => {
    mockDigest(syntheticHexDigest);
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    const filename = await resolveAccountDatabaseFilename({
      origin: "https://api.jamye.example",
      userId: VALID_USER_ID,
    });

    expect(filename).toMatch(/^jamye-account-v1-[0-9a-f]{64}\.db$/);
  });

  test("rejects a malformed digest instead of embedding it into a path-traversing filename", async () => {
    mockDigest(() => "../../../etc/passwd");
    const { resolveAccountDatabaseFilename } = loadNamespaceContract();

    await expect(
      resolveAccountDatabaseFilename({
        origin: "https://api.jamye.example",
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/digest/i);
  });
});
