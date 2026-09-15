type JsonRecord = Record<string, unknown>;

type GenerateResult = Readonly<{
  generatedFiles: readonly string[];
  lock: JsonRecord;
}>;

type CheckResult = Readonly<{ status: string; reason?: string }>;

type FileSystemModule = Readonly<{
  cpSync: (
    source: string,
    destination: string,
    options: Readonly<{ recursive: true }>,
  ) => void;
  existsSync: (path: string) => boolean;
  mkdtempSync: (prefix: string) => string;
  readFileSync: (path: string, encoding: "utf8") => string;
  rmSync: (
    path: string,
    options: Readonly<{ force: true; recursive: true }>,
  ) => void;
  writeFileSync: (path: string, contents: string, encoding: "utf8") => void;
}>;

type ChildProcessModule = Readonly<{
  execFileSync: (
    file: string,
    arguments_: readonly string[],
    options: Readonly<{
      cwd: string;
      encoding: "utf8";
      env: Record<string, string | undefined>;
    }>,
  ) => string;
}>;

type OperatingSystemModule = Readonly<{ tmpdir: () => string }>;
type PathModule = Readonly<{ join: (...paths: string[]) => string }>;
type CryptoHash = Readonly<{
  digest: (encoding: "hex") => string;
  update: (data: Uint8Array) => CryptoHash;
}>;
type CryptoModule = Readonly<{
  createHash: (algorithm: "sha256") => CryptoHash;
}>;

const { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } =
  jest.requireActual<FileSystemModule>("node:fs");
const { readFile: readFileBuffer } =
  jest.requireActual<
    Readonly<{ readFile: (path: string) => Promise<Uint8Array> }>
  >("node:fs/promises");
const { execFileSync } =
  jest.requireActual<ChildProcessModule>("node:child_process");
const { tmpdir } = jest.requireActual<OperatingSystemModule>("node:os");
const { join } = jest.requireActual<PathModule>("node:path");
const { createHash } = jest.requireActual<CryptoModule>("node:crypto");

const repositoryRoot = process.cwd();
const contractRoot = join(repositoryRoot, "contracts/server");
const generatedOutputName = "server-api.ts";

function requireTool(relativePath: string): string {
  const path = join(repositoryRoot, relativePath);
  if (!existsSync(path)) {
    throw new Error(
      `M6-01 implementation missing: ${relativePath} must export the deterministic contract tooling API.`,
    );
  }
  return path;
}

function runToolExport<Output>(
  toolRelativePath: string,
  exportName: string,
  input: JsonRecord,
): Output {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'import { pathToFileURL } from "node:url";',
        "const tool = await import(pathToFileURL(process.env.M6_CONTRACT_TOOL).href);",
        "const operation = tool[process.env.M6_CONTRACT_EXPORT];",
        'if (typeof operation !== "function") {',
        "  throw new Error(`Missing export ${process.env.M6_CONTRACT_EXPORT}.`);",
        "}",
        "const input = JSON.parse(process.env.M6_CONTRACT_INPUT);",
        "const result = await operation(input);",
        "process.stdout.write(JSON.stringify(result));",
      ].join("\n"),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        M6_CONTRACT_EXPORT: exportName,
        M6_CONTRACT_INPUT: JSON.stringify(input),
        M6_CONTRACT_TOOL: requireTool(toolRelativePath),
      },
    },
  );
  return JSON.parse(output) as Output;
}

function createTemporarySnapshot(): {
  generatedDirectory: string;
  root: string;
  temporaryContractRoot: string;
} {
  if (!existsSync(contractRoot)) {
    throw new Error(
      "M6-01 implementation missing: contracts/server must exist before tooling can be exercised.",
    );
  }
  const root = mkdtempSync(join(tmpdir(), "jamye-server-contract-test-"));
  const temporaryContractRoot = join(root, "server");
  const generatedDirectory = join(root, "generated");
  cpSync(contractRoot, temporaryContractRoot, { recursive: true });
  return { generatedDirectory, root, temporaryContractRoot };
}

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
}

describe("M6-01 deterministic server contract intake, generation, and drift check", () => {
  test("C3 points to the additive read anchor union, not only the legacy cursor", () => {
    const openapi = readJson(join(contractRoot, "openapi.json"));
    expect(openapi).toHaveProperty(
      [
        "paths",
        "/api/v1/chatrooms/{chatroom_id}/read",
        "post",
        "requestBody",
        "content",
        "application/json",
        "schema",
        "$ref",
      ],
      "#/components/schemas/ReadAnchorIn",
    );
    expect(openapi).toHaveProperty(
      ["components", "schemas", "ReadAnchorIn", "oneOf"],
      [
        { $ref: "#/components/schemas/ReadCursorIn" },
        { $ref: "#/components/schemas/ReadMessageIdIn" },
      ],
    );
  });

  test("checks the checked-in snapshot and generated output without mutating them", () => {
    const generatedDirectory = join(
      repositoryRoot,
      "src/core/contracts/generated/server",
    );
    const trackedFiles = [
      "contracts/server/manifest.json",
      "contracts/server/intake.json",
      "contracts/server/contract.lock",
      "src/core/contracts/generated/server/server-api.ts",
    ].map((relativePath) => join(repositoryRoot, relativePath));
    const before = trackedFiles.map((path) => readFileSync(path, "utf8"));

    const result = runToolExport<CheckResult>(
      "tools/contracts/check-server-contract.mjs",
      "checkServerContract",
      { contractRoot, generatedDirectory },
    );

    expect(result).toEqual(expect.objectContaining({ status: "ok" }));
    expect(trackedFiles.map((path) => readFileSync(path, "utf8"))).toEqual(
      before,
    );
  });

  test("records the exact upstream Git revision, bundle checksum, and generator/validator identity", () => {
    const intake = readJson(join(contractRoot, "intake.json"));
    expect(intake).toEqual(
      expect.objectContaining({
        generator_identity: "openapi-typescript@7.13.0",
        intake_kind: "server-snapshot",
        source_git_revision: "97d3d264da547d7978b6e0d65052d0b1813512a9",
        upstream_bundle_sha256:
          "b95e463946861d981c9e973fa048f6ee6dc4e63307f5e29583be6478bc650b69",
        upstream_bundle_verified: true,
        upstream_contract_version: "1",
        upstream_server_commit: "dirty",
        validator_identity: "ajv@8.20.0",
      }),
    );
    expect(intake.schema_closure_operation_ids).toEqual([
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "H1",
      "H2",
      "U1",
    ]);
  });

  test("preserves the upstream manifest verbatim, including its dirty server_commit", () => {
    const manifest = readJson(join(contractRoot, "manifest.json"));
    expect(manifest).toEqual(
      expect.objectContaining({
        contract_version: "1",
        server_commit: "dirty",
        server_tag: null,
        sha256:
          "b95e463946861d981c9e973fa048f6ee6dc4e63307f5e29583be6478bc650b69",
      }),
    );
  });

  test("regenerates byte-identical types and lock in a temporary output directory", () => {
    const temporary = createTemporarySnapshot();
    try {
      const first = runToolExport<GenerateResult>(
        "tools/contracts/generate-server-contract.mjs",
        "generateServerContract",
        {
          contractRoot: temporary.temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );
      const generatedPath = join(
        temporary.generatedDirectory,
        generatedOutputName,
      );
      const firstGenerated = readFileSync(generatedPath, "utf8");
      const second = runToolExport<GenerateResult>(
        "tools/contracts/generate-server-contract.mjs",
        "generateServerContract",
        {
          contractRoot: temporary.temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );

      expect(first.generatedFiles).toContain(generatedOutputName);
      expect(first).toEqual(second);
      expect(readFileSync(generatedPath, "utf8")).toBe(firstGenerated);
      expect(firstGenerated).toContain("Generated by openapi-typescript");
      expect(first.lock.contract_version).toBe("1");
      expect(first.lock.schema_closure_operation_ids).toEqual([
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "H1",
        "H2",
        "U1",
        "G1",
        "G2",
        "G3",
        "G4",
        "G5",
        "G6",
        "G7",
        "G8",
        "I1",
        "I2",
        "C1",
        "C2",
        "C3",
        "C4",
        "S1",
        "R1",
        "T1",
        "T2",
        "T3",
        "T4",
        "T5",
        "T6",
        "T7",
        "MD1",
        "MD2",
        "MD3",
        "MD4",
        "MD5",
      ]);
    } finally {
      rmSync(temporary.root, { force: true, recursive: true });
    }
  });

  test("reports generated-output drift without rewriting the checked output", () => {
    const temporary = createTemporarySnapshot();
    try {
      runToolExport<GenerateResult>(
        "tools/contracts/generate-server-contract.mjs",
        "generateServerContract",
        {
          contractRoot: temporary.temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );
      const generatedPath = join(
        temporary.generatedDirectory,
        generatedOutputName,
      );
      writeFileSync(generatedPath, "// intentional test drift\n", "utf8");

      const result = runToolExport<CheckResult>(
        "tools/contracts/check-server-contract.mjs",
        "checkServerContract",
        {
          contractRoot: temporary.temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );

      expect(result).toEqual(expect.objectContaining({ status: "drift" }));
      expect(readFileSync(generatedPath, "utf8")).toBe(
        "// intentional test drift\n",
      );
    } finally {
      rmSync(temporary.root, { force: true, recursive: true });
    }
  });

  test("flags a hand-edited preserved manifest as tampered rather than silently accepting it", () => {
    const temporary = createTemporarySnapshot();
    try {
      runToolExport<GenerateResult>(
        "tools/contracts/generate-server-contract.mjs",
        "generateServerContract",
        {
          contractRoot: temporary.temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );
      const manifest = readJson(
        join(temporary.temporaryContractRoot, "manifest.json"),
      );
      writeFileSync(
        join(temporary.temporaryContractRoot, "manifest.json"),
        JSON.stringify({ ...manifest, server_commit: "clean" }),
        "utf8",
      );

      const result = runToolExport<CheckResult>(
        "tools/contracts/check-server-contract.mjs",
        "checkServerContract",
        {
          contractRoot: temporary.temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          reason: "upstream-manifest-drift",
          status: "tampered",
        }),
      );
    } finally {
      rmSync(temporary.root, { force: true, recursive: true });
    }
  });

  test("intake rejects an upstream bundle whose declared checksum does not match its artifacts", async () => {
    const upstreamRoot = mkdtempSync(
      join(tmpdir(), "jamye-server-upstream-test-"),
    );
    const localRoot = join(upstreamRoot, "local");
    try {
      const openapi = readJson(join(contractRoot, "openapi.json"));
      writeFileSync(
        join(upstreamRoot, "openapi.json"),
        JSON.stringify(openapi),
        "utf8",
      );
      writeFileSync(
        join(upstreamRoot, "manifest.json"),
        JSON.stringify({
          artifacts: ["openapi.json", "manifest.json"],
          checksum_algorithm:
            "sha256 over lexicographic path,NUL,decimal-length,NUL,bytes entries; manifest.json uses recursively key-sorted compact JSON without sha256; v1",
          contract_version: "1",
          server_commit: "dirty",
          sha256: "0".repeat(64),
        }),
        "utf8",
      );

      let caught: unknown;
      try {
        runToolExport(
          "tools/contracts/intake-server-contract.mjs",
          "intakeServerContract",
          {
            localContractRoot: localRoot,
            sourceGitRevision: "0000000000000000000000000000000000000000",
            upstreamContractRoot: upstreamRoot,
          },
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect(existsSync(join(localRoot, "openapi.json"))).toBe(false);
    } finally {
      rmSync(upstreamRoot, { force: true, recursive: true });
    }
  });

  test("intake rejects an artifact path that escapes the contract root", async () => {
    const upstreamRoot = mkdtempSync(
      join(tmpdir(), "jamye-server-upstream-escape-test-"),
    );
    const localRoot = join(upstreamRoot, "local");
    try {
      writeFileSync(
        join(upstreamRoot, "openapi.json"),
        JSON.stringify({ info: { version: "1" } }),
        "utf8",
      );
      writeFileSync(
        join(upstreamRoot, "manifest.json"),
        JSON.stringify({
          artifacts: ["../outside-secret.json", "openapi.json"],
          checksum_algorithm:
            "sha256 over lexicographic path,NUL,decimal-length,NUL,bytes entries; manifest.json uses recursively key-sorted compact JSON without sha256; v1",
          contract_version: "1",
          server_commit: "dirty",
          sha256: "0".repeat(64),
        }),
        "utf8",
      );

      let caught: unknown;
      try {
        runToolExport(
          "tools/contracts/intake-server-contract.mjs",
          "intakeServerContract",
          {
            localContractRoot: localRoot,
            sourceGitRevision: "0000000000000000000000000000000000000000",
            upstreamContractRoot: upstreamRoot,
          },
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
    } finally {
      rmSync(upstreamRoot, { force: true, recursive: true });
    }
  });

  test("selectively vendors only the M9 realtime schemas and the three M9 recovery fixtures, with recorded provenance", async () => {
    const intake = readJson(join(contractRoot, "intake.json"));
    const vendorSha256 = intake.selective_vendor_sha256;
    expect(vendorSha256).toEqual(
      expect.objectContaining({
        "fixtures/mobile-sync-handoff.json": expect.any(String),
        "fixtures/realtime-lifecycle.json": expect.any(String),
        "fixtures/unknown-event-recovery.json": expect.any(String),
        "realtime/client-frame.schema.json": expect.any(String),
        "realtime/message.created.schema.json": expect.any(String),
        "realtime/protocol.json": expect.any(String),
        "realtime/server-frame.schema.json": expect.any(String),
        "realtime/topic.created.schema.json": expect.any(String),
      }),
    );
    expect(Object.keys(vendorSha256 as Record<string, string>).sort()).toEqual([
      "fixtures/mobile-sync-handoff.json",
      "fixtures/realtime-lifecycle.json",
      "fixtures/unknown-event-recovery.json",
      "realtime/client-frame.schema.json",
      "realtime/message.created.schema.json",
      "realtime/protocol.json",
      "realtime/server-frame.schema.json",
      "realtime/topic.created.schema.json",
    ]);
    for (const [artifactPath, expectedSha256] of Object.entries(
      vendorSha256 as Record<string, string>,
    )) {
      const bytes = await readFileBuffer(join(contractRoot, artifactPath));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        expectedSha256,
      );
      expect(bytes.length > 0).toBe(true);
    }
  });

  test("reports vendored-artifact drift when a selectively vendored M9 fixture is hand-edited", () => {
    const temporary = createTemporarySnapshot();
    try {
      writeFileSync(
        join(
          temporary.temporaryContractRoot,
          "fixtures/mobile-sync-handoff.json",
        ),
        JSON.stringify({ tampered: true }),
        "utf8",
      );

      const result = runToolExport<CheckResult>(
        "tools/contracts/check-server-contract.mjs",
        "checkServerContract",
        {
          contractRoot: temporary.temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          reason: "vendored-artifact-drift",
          status: "tampered",
        }),
      );
    } finally {
      rmSync(temporary.root, { force: true, recursive: true });
    }
  });

  test("reports missing provenance when intake.json predates the M9 vendored-artifact map", () => {
    const temporary = createTemporarySnapshot();
    try {
      const intake = readJson(
        join(temporary.temporaryContractRoot, "intake.json"),
      );
      const { selective_vendor_sha256: _omitted, ...withoutProvenance } =
        intake;
      writeFileSync(
        join(temporary.temporaryContractRoot, "intake.json"),
        JSON.stringify(withoutProvenance),
        "utf8",
      );

      const result = runToolExport<CheckResult>(
        "tools/contracts/check-server-contract.mjs",
        "checkServerContract",
        {
          contractRoot: temporary.temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          reason: "vendored-artifact-provenance-missing",
          status: "error",
        }),
      );
    } finally {
      rmSync(temporary.root, { force: true, recursive: true });
    }
  });
});
