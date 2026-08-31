type JsonRecord = Record<string, unknown>;

type AjvValidator = (value: unknown) => boolean;

type AjvInstance = Readonly<{
  compile: (schema: unknown) => AjvValidator;
}>;

type AjvConstructor = new (options?: JsonRecord) => AjvInstance;

type FileSystemModule = Readonly<{
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: "utf8") => string;
}>;

type PathModule = Readonly<{
  resolve: (...paths: string[]) => string;
}>;

const { existsSync, readFileSync } =
  jest.requireActual<FileSystemModule>("node:fs");
const { resolve } = jest.requireActual<PathModule>("node:path");

const repositoryRoot = process.cwd();
const contractRoot = resolve(repositoryRoot, "contracts/bootstrap");

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readContractJson(relativePath: string): unknown {
  const path = resolve(contractRoot, relativePath);
  if (!existsSync(path)) {
    throw new Error(
      `M4-CONTRACT-1 implementation missing: contracts/bootstrap/${relativePath} must exist.`,
    );
  }

  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a JSON array.`);
  }

  return value;
}

function hasRequiredVersionHeader(parameters: unknown): boolean {
  return requireArray(parameters, "operation parameters").some((parameter) => {
    if (!isRecord(parameter)) {
      return false;
    }

    const schema = parameter.schema;
    return (
      parameter.in === "header" &&
      parameter.name === "X-Jamye-Contract-Version" &&
      parameter.required === true &&
      isRecord(schema) &&
      schema.const === "bootstrap.v2"
    );
  });
}

function loadAjv2020(): AjvConstructor {
  const loaded = jest.requireActual<{ default?: AjvConstructor }>(
    "ajv/dist/2020",
  );
  if (!loaded.default) {
    throw new Error(
      "Ajv 2020-12 constructor is unavailable to contract tests.",
    );
  }

  return loaded.default;
}

describe("M4-CONTRACT-1 bootstrap wire source contract", () => {
  test("defines exactly the two anonymous local-bootstrap REST operations with the common version header", () => {
    const openApi = requireRecord(
      readContractJson("openapi.json"),
      "openapi.json",
    );
    const paths = requireRecord(openApi.paths, "openapi.paths");

    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.servers).toBeUndefined();
    expect(openApi.security).toBeUndefined();
    expect(Object.keys(paths).sort()).toEqual([
      "/bootstrap/v1/conversations/{conversation_id}/events",
      "/bootstrap/v1/conversations/{conversation_id}/messages",
    ]);

    const messages = requireRecord(
      paths["/bootstrap/v1/conversations/{conversation_id}/messages"],
      "message-command path item",
    );
    const events = requireRecord(
      paths["/bootstrap/v1/conversations/{conversation_id}/events"],
      "conversation-delta path item",
    );

    expect(Object.keys(messages)).toEqual(["post"]);
    expect(Object.keys(events)).toEqual(["get"]);

    const post = requireRecord(messages.post, "message-command POST operation");
    const get = requireRecord(events.get, "conversation-delta GET operation");

    expect(hasRequiredVersionHeader(post.parameters)).toBe(true);
    expect(hasRequiredVersionHeader(get.parameters)).toBe(true);
    expect(requireRecord(post.responses, "POST responses")).toEqual(
      expect.objectContaining({
        "200": expect.any(Object),
        "400": expect.any(Object),
        "409": expect.any(Object),
      }),
    );
    expect(requireRecord(get.responses, "GET responses")).toEqual(
      expect.objectContaining({
        "200": expect.any(Object),
        "400": expect.any(Object),
        "409": expect.any(Object),
      }),
    );

    const serialized = JSON.stringify(openApi);
    expect(serialized).toContain("./realtime-event.schema.json");
    expect(serialized).not.toMatch(
      /authorization|cookie|session|credential|bearer|https?:\/\//i,
    );
  });

  test("validates known optional-additive and unknown events under the shared 2020-12 schema", () => {
    const schema = readContractJson("realtime-event.schema.json");
    const optionalKnownEvent = readContractJson(
      "fixtures/message-upsert.optional-field.json",
    );
    const unknownEvent = readContractJson("fixtures/unknown-event.json");
    const invalidKnownEvent = readContractJson(
      "fixtures/invalid/message-upsert.missing-required.json",
    );
    const Ajv2020 = loadAjv2020();
    const validate = new Ajv2020({ strict: false }).compile(schema);

    const schemaRecord = requireRecord(schema, "realtime-event.schema.json");
    expect(schemaRecord.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(
      requireRecord(schemaRecord.$defs, "realtime-event.schema.json.$defs"),
    ).toEqual(
      expect.objectContaining({ messageUpsertPayload: expect.any(Object) }),
    );
    expect(JSON.stringify(schema)).toContain("message.upsert");
    expect(validate(optionalKnownEvent)).toBe(true);
    expect(validate(unknownEvent)).toBe(true);
    expect(validate(invalidKnownEvent)).toBe(false);

    const knownPayload = requireRecord(
      requireRecord(optionalKnownEvent, "optional known event").payload,
      "optional known event payload",
    );
    expect(knownPayload).toEqual(
      expect.objectContaining({
        message_id: expect.any(String),
        sender_id: expect.any(String),
        body: expect.any(String),
        created_at_ms: expect.any(Number),
      }),
    );
    expect(Object.keys(knownPayload)).toContain("optional_trace");
  });

  test("keeps the required local bootstrap provenance fields and a deliberate null server binding", () => {
    const manifest = requireRecord(
      readContractJson("manifest.json"),
      "manifest.json",
    );
    const lock = requireRecord(
      readContractJson("contract.lock"),
      "contract.lock",
    );

    expect(manifest).toEqual(
      expect.objectContaining({
        status: "bootstrap",
        contract_version: "bootstrap.v2",
        source_kind: "repository-local-bootstrap",
        server_tag: null,
        server_commit: null,
        server_provenance_status: "unbound-local-bootstrap",
        generator_identity: "openapi-typescript@7.13.0",
        validator_identity: "ajv@8.20.0",
      }),
    );
    for (const checksum of [
      "source_sha256",
      "realtime_schema_sha256",
      "fixtures_sha256",
    ]) {
      expect(manifest[checksum]).toMatch(/^[a-f0-9]{64}$/);
    }

    expect(lock).toEqual(
      expect.objectContaining({
        contract_version: "bootstrap.v2",
        manifest_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        breaking_shape_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        contract_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  test("includes an explicit same-version required-type breaking fixture without secrets or production endpoints", () => {
    const breakingFixture = requireRecord(
      readContractJson(
        "fixtures/invalid/breaking-required-type-without-version-bump.json",
      ),
      "breaking-version fixture",
    );
    const fixturePaths = [
      "fixtures/message-command.request.json",
      "fixtures/message-command.response.json",
      "fixtures/conversation-delta.response.json",
      "fixtures/message-upsert.optional-field.json",
      "fixtures/unknown-event.json",
      "fixtures/invalid/message-upsert.missing-required.json",
      "fixtures/invalid/breaking-required-type-without-version-bump.json",
    ];

    expect(breakingFixture).toEqual({
      contract_version: "bootstrap.v2",
      mutation: {
        pointer: "/$defs/messageUpsertPayload/properties/body/type",
        replacement: "integer",
      },
    });

    for (const fixturePath of fixturePaths) {
      const fixture = readContractJson(fixturePath);
      expect(JSON.stringify(fixture)).not.toMatch(
        /authorization|cookie|session|credential|bearer|https?:\/\/|wss?:\/\//i,
      );
    }
  });

  test("documents bootstrap provenance and the complete production-contract replacement condition", () => {
    const readmePath = resolve(repositoryRoot, "README.md");
    const readme = readFileSync(readmePath, "utf8");

    expect(readme).toMatch(/status\s*=\s*bootstrap/i);
    expect(readme).toMatch(/contract_version\s*=\s*bootstrap\.v2/i);
    expect(readme).toMatch(/contract\.lock/i);
    expect(readme).toMatch(/server_tag/i);
    expect(readme).toMatch(/server_commit/i);
    expect(readme).toMatch(/(?:null|없음|미연결|unbound)/i);
    expect(readme).toMatch(
      /(?:non-bootstrap|bootstrap\s*(?:이외|외)|비-bootstrap)/i,
    );
    expect(readme).toMatch(/(?:authenticated|인증된)/i);
    expect(readme).toMatch(
      /(?:source ownership|소스.*소유|source.*ownership)/i,
    );
    expect(readme).toMatch(/(?:approved|승인)/i);
    expect(readme).toMatch(/(?:auth|인증)/i);
    expect(readme).toMatch(/(?:endpoint|엔드포인트)/i);
    expect(readme).toMatch(/(?:regenerate|재생성)/i);
    expect(readme).toMatch(/types?/i);
    expect(readme).toMatch(/fixtures?/i);
    expect(readme).toMatch(/manifest/i);
    expect(readme).toMatch(/(?:compatibility|호환성)/i);
    expect(readme).toMatch(/(?:review|검토)/i);
    expect(readme).toMatch(/M6/i);
    expect(readme).toMatch(/(?:decision|결정)/i);
    expect(readme).toMatch(/(?:only after|모두.*충족|전부.*충족|모든.*조건)/i);
  });
});
