type JsonRecord = Record<string, unknown>;

type GeneratorResult = Readonly<{
  generatedFiles: readonly string[];
  manifest: JsonRecord;
  lock: JsonRecord;
}>;

type ContractCheckResult = Readonly<{
  status: "ok" | "drift" | "incompatible";
  reason?: string;
}>;

type BreakingFixture = Readonly<{
  contract_version: string;
  mutation: Readonly<{
    pointer: string;
    replacement: unknown;
  }>;
}>;

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

type OperatingSystemModule = Readonly<{
  tmpdir: () => string;
}>;

type PathModule = Readonly<{
  join: (...paths: string[]) => string;
  relative: (from: string, to: string) => string;
}>;

const { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } =
  jest.requireActual<FileSystemModule>("node:fs");
const { execFileSync } =
  jest.requireActual<ChildProcessModule>("node:child_process");
const { tmpdir } = jest.requireActual<OperatingSystemModule>("node:os");
const { join, relative } = jest.requireActual<PathModule>("node:path");
const typescript =
  jest.requireActual<typeof import("typescript")>("typescript");

const repositoryRoot = process.cwd();
const contractRoot = join(repositoryRoot, "contracts/bootstrap");
const generatedOutputName = "bootstrap-api.ts";

function requireTool(relativePath: string): string {
  const path = join(repositoryRoot, relativePath);
  if (!existsSync(path)) {
    throw new Error(
      `M4-CONTRACT-1 implementation missing: ${relativePath} must export the deterministic contract tooling API.`,
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
        "const tool = await import(pathToFileURL(process.env.M4_CONTRACT_TOOL).href);",
        "const operation = tool[process.env.M4_CONTRACT_EXPORT];",
        'if (typeof operation !== "function") {',
        "  throw new Error(`Missing export ${process.env.M4_CONTRACT_EXPORT}.`);",
        "}",
        "const input = JSON.parse(process.env.M4_CONTRACT_INPUT);",
        "const result = await operation(input);",
        "process.stdout.write(JSON.stringify(result));",
      ].join("\n"),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        M4_CONTRACT_EXPORT: exportName,
        M4_CONTRACT_INPUT: JSON.stringify(input),
        M4_CONTRACT_TOOL: requireTool(toolRelativePath),
      },
    },
  );

  return JSON.parse(output) as Output;
}

function createTemporaryContractRoot(): {
  generatedDirectory: string;
  root: string;
} {
  if (!existsSync(contractRoot)) {
    throw new Error(
      "M4-CONTRACT-1 implementation missing: contracts/bootstrap must exist before tooling can be exercised.",
    );
  }

  const root = mkdtempSync(join(tmpdir(), "jamye-contract-test-"));
  const copiedContractRoot = join(root, "bootstrap");
  const generatedDirectory = join(root, "generated");
  cpSync(contractRoot, copiedContractRoot, { recursive: true });

  return { generatedDirectory, root };
}

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
}

function readCheckedInContractFile(relativePath: string): string {
  const path = join(repositoryRoot, relativePath);
  if (!existsSync(path)) {
    throw new Error(
      `M4-CONTRACT-1 implementation missing: ${relativePath} must exist as checked-in contract output.`,
    );
  }

  return readFileSync(path, "utf8");
}

function formatTypeScriptDiagnostic(
  diagnostic: import("typescript").Diagnostic,
): string {
  const message = typescript.flattenDiagnosticMessageText(
    diagnostic.messageText,
    "\n",
  );
  if (!diagnostic.file || diagnostic.start === undefined) {
    return `TS${diagnostic.code}: ${message}`;
  }

  const position = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start,
  );
  const location = `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}`;
  return `${location} TS${diagnostic.code}: ${message}`;
}

function typeCheckGeneratedContractProbe(probeBody: string): string[] {
  const root = mkdtempSync(join(tmpdir(), "jamye-contract-type-probe-"));
  const generatedModule = relative(
    root,
    join(repositoryRoot, "src/core/contracts/generated/bootstrap-api"),
  ).replace(/\\/g, "/");
  const importPath = generatedModule.startsWith(".")
    ? generatedModule
    : `./${generatedModule}`;
  const probePath = join(root, "generated-contract-semantics.ts");

  try {
    writeFileSync(
      probePath,
      `import type { components, paths } from ${JSON.stringify(importPath)};\n\n${probeBody}\n`,
      "utf8",
    );
    const program = typescript.createProgram({
      options: {
        module: typescript.ModuleKind.ESNext,
        moduleResolution: typescript.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: typescript.ScriptTarget.ES2022,
      },
      rootNames: [probePath],
    });

    return typescript
      .getPreEmitDiagnostics(program)
      .map(formatTypeScriptDiagnostic);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function applyPointerMutation(
  value: unknown,
  pointer: string,
  replacement: unknown,
): void {
  if (!pointer.startsWith("/")) {
    throw new Error(
      "Breaking fixture pointer must be an absolute JSON pointer.",
    );
  }

  const segments = pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  const last = segments.pop();
  let current = value;

  for (const segment of segments) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !(segment in current)
    ) {
      throw new Error(`Breaking fixture pointer cannot resolve ${pointer}.`);
    }
    current = (current as JsonRecord)[segment];
  }

  if (
    !last ||
    typeof current !== "object" ||
    current === null ||
    Array.isArray(current)
  ) {
    throw new Error(`Breaking fixture pointer cannot set ${pointer}.`);
  }

  (current as JsonRecord)[last] = replacement;
}

describe("M4-CONTRACT-1 deterministic bootstrap generation and drift contract", () => {
  test("checks the checked-in canonical sources and generated output without mutating them", () => {
    const generatedDirectory = join(
      repositoryRoot,
      "src/core/contracts/generated",
    );
    const trackedFiles = [
      "contracts/bootstrap/manifest.json",
      "contracts/bootstrap/contract.lock",
      "src/core/contracts/generated/bootstrap-api.ts",
    ];
    const before = trackedFiles.map(readCheckedInContractFile);

    const result = runToolExport<ContractCheckResult>(
      "tools/contracts/check-bootstrap-contract.mjs",
      "checkBootstrapContract",
      { contractRoot, generatedDirectory },
    );

    expect(result).toEqual(expect.objectContaining({ status: "ok" }));
    expect(trackedFiles.map(readCheckedInContractFile)).toEqual(before);
  });

  test("canonicalizes JSON and regenerates byte-identical types, manifest, and lock in a temporary output directory", () => {
    const temporary = createTemporaryContractRoot();
    const temporaryContractRoot = join(temporary.root, "bootstrap");

    try {
      const first = runToolExport<GeneratorResult>(
        "tools/contracts/generate-bootstrap-contract.mjs",
        "generateBootstrapContract",
        {
          contractRoot: temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );
      const generatedPath = join(
        temporary.generatedDirectory,
        generatedOutputName,
      );
      const firstGenerated = readFileSync(generatedPath, "utf8");
      const second = runToolExport<GeneratorResult>(
        "tools/contracts/generate-bootstrap-contract.mjs",
        "generateBootstrapContract",
        {
          contractRoot: temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );

      expect(first.generatedFiles).toContain(generatedOutputName);
      expect(first).toEqual(second);
      expect(readFileSync(generatedPath, "utf8")).toBe(firstGenerated);
      expect(firstGenerated).toContain("Generated by openapi-typescript");
      expect(first.manifest.server_tag).toBeNull();
      expect(first.manifest.server_commit).toBeNull();
      expect(first.lock.contract_version).toBe("bootstrap.v2");
      expect(first.lock.breaking_shape_sha256).toBe(
        "1534ebec10cf5e8d12545f6e4ffaed797b91f39aae494175830c2e55d0cf2385",
      );
    } finally {
      rmSync(temporary.root, { force: true, recursive: true });
    }
  });

  test("types checked-in REST events as instances with open payloads and a distinct known payload schema", () => {
    const unknownEvent = readJson(
      join(contractRoot, "fixtures/unknown-event.json"),
    );
    const optionalKnownEvent = readJson(
      join(contractRoot, "fixtures/message-upsert.optional-field.json"),
    );
    const diagnostics = typeCheckGeneratedContractProbe(`
type MessageCommandEvent = paths["/bootstrap/v1/conversations/{conversation_id}/messages"]["post"]["responses"][200]["content"]["application/json"]["event"];
type ConversationDeltaEvent = paths["/bootstrap/v1/conversations/{conversation_id}/events"]["get"]["responses"][200]["content"]["application/json"]["events"][number];
type MessageUpsertPayload = components["schemas"]["messageUpsertPayload"];

const unknownEvent = ${JSON.stringify(unknownEvent)} as const;
const optionalKnownEvent = ${JSON.stringify(optionalKnownEvent)} as const;

const unknownMessageCommandEvent: MessageCommandEvent = unknownEvent;
const unknownConversationDeltaEvent: ConversationDeltaEvent = unknownEvent;
const knownMessageCommandEvent: MessageCommandEvent = optionalKnownEvent;
const knownConversationDeltaEvent: ConversationDeltaEvent = optionalKnownEvent;
const knownPayload: MessageUpsertPayload = optionalKnownEvent.payload;

void [
  unknownMessageCommandEvent,
  unknownConversationDeltaEvent,
  knownMessageCommandEvent,
  knownConversationDeltaEvent,
  knownPayload,
];
`);

    expect(diagnostics).toEqual([]);
  });

  test("reports generated-output drift without rewriting the checked output", () => {
    const temporary = createTemporaryContractRoot();
    const temporaryContractRoot = join(temporary.root, "bootstrap");

    try {
      runToolExport<GeneratorResult>(
        "tools/contracts/generate-bootstrap-contract.mjs",
        "generateBootstrapContract",
        {
          contractRoot: temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );
      const generatedPath = join(
        temporary.generatedDirectory,
        generatedOutputName,
      );
      writeFileSync(generatedPath, "// intentional test drift\n", "utf8");

      const result = runToolExport<ContractCheckResult>(
        "tools/contracts/check-bootstrap-contract.mjs",
        "checkBootstrapContract",
        {
          contractRoot: temporaryContractRoot,
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

  test("flags a required-field type change with the same contract version using the checked-in breaking fixture", () => {
    const temporary = createTemporaryContractRoot();
    const temporaryContractRoot = join(temporary.root, "bootstrap");

    try {
      runToolExport<GeneratorResult>(
        "tools/contracts/generate-bootstrap-contract.mjs",
        "generateBootstrapContract",
        {
          contractRoot: temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );
      const fixture = readJson(
        join(
          temporaryContractRoot,
          "fixtures/invalid/breaking-required-type-without-version-bump.json",
        ),
      ) as BreakingFixture;
      const candidateSchema = readJson(
        join(temporaryContractRoot, "realtime-event.schema.json"),
      );
      applyPointerMutation(
        candidateSchema,
        fixture.mutation.pointer,
        fixture.mutation.replacement,
      );
      writeFileSync(
        join(temporaryContractRoot, "realtime-event.schema.json"),
        `${JSON.stringify(candidateSchema, null, 2)}\n`,
        "utf8",
      );

      const result = runToolExport<ContractCheckResult>(
        "tools/contracts/check-bootstrap-contract.mjs",
        "checkBootstrapContract",
        {
          baselineLockPath: join(contractRoot, "contract.lock"),
          contractRoot: temporaryContractRoot,
          generatedDirectory: temporary.generatedDirectory,
        },
      );

      expect(fixture.contract_version).toBe("bootstrap.v2");
      expect(result).toEqual(
        expect.objectContaining({
          reason: "breaking-shape-changed-without-version-bump",
          status: "incompatible",
        }),
      );
    } finally {
      rmSync(temporary.root, { force: true, recursive: true });
    }
  });
});
