type JsonRecord = Record<string, unknown>;

type CanonicalMessageUpsert = Readonly<{
  conversationId: string;
  cursor: string;
  eventId: string;
  message: Readonly<{
    body: string;
    clientMsgId: string | null;
    createdAtMs: number;
    localId: string;
    senderId: string;
  }>;
  payloadJson: string;
  recordedAtMs: number;
  serverSequence: number;
}>;

type UnknownWireEvent = Readonly<{
  conversationId: string;
  eventId: string;
  payloadJson: string;
  recordedAtMs: number;
  serverSequence: number;
  type: string;
}>;

type ContractRepositoryPort = Readonly<{
  applyCanonicalMessageUpsert: (
    event: CanonicalMessageUpsert,
  ) => Promise<Readonly<{ outcome: "applied" | "duplicate" }>>;
  recordUnknownEvent: (
    event: UnknownWireEvent,
  ) => Promise<Readonly<{ outcome: "recorded" | "duplicate" }>>;
}>;

type WireApplyResult =
  | Readonly<{ kind: "invalid"; issues: readonly string[] }>
  | Readonly<{ kind: "known"; outcome: "applied" | "duplicate" }>
  | Readonly<{
      kind: "unknown";
      outcome: "recorded" | "duplicate";
      recovery: "request_delta";
    }>;

type WireBoundary = Readonly<{
  validateAndApply: (event: unknown) => Promise<WireApplyResult>;
}>;

type WireBoundaryOptions = Readonly<{
  now: () => number;
}>;

type ValidateWireModule = Readonly<{
  createWireEventBoundary?: unknown;
}>;

type MapperModule = Readonly<{
  mapMessageUpsertEvent?: unknown;
}>;

type DirectoryEntry = Readonly<{
  isDirectory: () => boolean;
  name: string;
}>;

type FileSystemModule = Readonly<{
  existsSync: (path: string) => boolean;
  readdirSync: (
    path: string,
    options: Readonly<{ withFileTypes: true }>,
  ) => DirectoryEntry[];
  readFileSync: (path: string, encoding: "utf8") => string;
}>;

type PathModule = Readonly<{
  extname: (path: string) => string;
  join: (...paths: string[]) => string;
}>;

const { existsSync, readdirSync, readFileSync } =
  jest.requireActual<FileSystemModule>("node:fs");
const { extname, join } = jest.requireActual<PathModule>("node:path");

const repositoryRoot = process.cwd();
const contractRoot = join(repositoryRoot, "contracts/bootstrap");
const sourceRoot = join(repositoryRoot, "src/core/contracts");

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalizeJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJson(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
      .join(",")}}`;
  }

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Contract fixtures must contain only JSON values.");
  }
  return serialized;
}

function loadFixture(relativePath: string): unknown {
  const path = join(contractRoot, relativePath);
  if (!existsSync(path)) {
    throw new Error(
      `M4-CONTRACT-1 implementation missing: contracts/bootstrap/${relativePath} must exist.`,
    );
  }

  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function loadBoundary(): (
  repository: ContractRepositoryPort,
  options: WireBoundaryOptions,
) => WireBoundary {
  let loaded: ValidateWireModule;
  try {
    loaded = jest.requireActual<ValidateWireModule>(
      "../../src/core/contracts/validate-wire",
    );
  } catch (error) {
    if (
      isRecord(error) &&
      (error.code === "MODULE_NOT_FOUND" ||
        (typeof error.message === "string" &&
          error.message.includes("Cannot find module")))
    ) {
      throw new Error(
        "M4-CONTRACT-1 implementation missing: validate-wire.ts must export createWireEventBoundary(repository, { now }).",
      );
    }
    throw error;
  }

  if (typeof loaded.createWireEventBoundary !== "function") {
    throw new Error(
      "M4-CONTRACT-1 implementation incomplete: validate-wire.ts must export createWireEventBoundary(repository, { now }).",
    );
  }

  return loaded.createWireEventBoundary as (
    repository: ContractRepositoryPort,
    options: WireBoundaryOptions,
  ) => WireBoundary;
}

function loadMapper(): (
  event: unknown,
  recordedAtMs: number,
) => CanonicalMessageUpsert {
  let loaded: MapperModule;
  try {
    loaded = jest.requireActual<MapperModule>(
      "../../src/core/contracts/map-message-event",
    );
  } catch (error) {
    if (
      isRecord(error) &&
      (error.code === "MODULE_NOT_FOUND" ||
        (typeof error.message === "string" &&
          error.message.includes("Cannot find module")))
    ) {
      throw new Error(
        "M4-CONTRACT-1 implementation missing: map-message-event.ts must export mapMessageUpsertEvent(event, recordedAtMs).",
      );
    }
    throw error;
  }

  if (typeof loaded.mapMessageUpsertEvent !== "function") {
    throw new Error(
      "M4-CONTRACT-1 implementation incomplete: map-message-event.ts must export mapMessageUpsertEvent(event, recordedAtMs).",
    );
  }

  return loaded.mapMessageUpsertEvent as (
    event: unknown,
    recordedAtMs: number,
  ) => CanonicalMessageUpsert;
}

function listTypeScriptFiles(root: string): string[] {
  if (!existsSync(root)) {
    throw new Error(
      "M4-CONTRACT-1 implementation missing: src/core/contracts must contain the contract-only source boundary.",
    );
  }

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(path));
    } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }

  return files.sort();
}

describe("M4-CONTRACT-1 validated event boundary", () => {
  test("maps the approved snake_case message.upsert envelope into the database repository shape", () => {
    const mapMessageUpsertEvent = loadMapper();
    const event = loadFixture("fixtures/message-upsert.optional-field.json");

    expect(mapMessageUpsertEvent(event, 300)).toEqual({
      conversationId: "fixture-conversation",
      cursor: "cursor-1",
      eventId: "event-message-1",
      message: {
        body: "fixture hello",
        clientMsgId: "client-message-1",
        createdAtMs: 100,
        localId: "message-1",
        senderId: "fixture-sender",
      },
      payloadJson: canonicalizeJson(event),
      recordedAtMs: 300,
      serverSequence: 1,
    });
  });

  test("applies a valid known event through the injected repository port and returns a typed known result", async () => {
    const knownEvents: CanonicalMessageUpsert[] = [];
    const unknownEvents: UnknownWireEvent[] = [];
    const boundary = loadBoundary()(
      {
        applyCanonicalMessageUpsert: async (event) => {
          knownEvents.push(event);
          return { outcome: "applied" };
        },
        recordUnknownEvent: async (event) => {
          unknownEvents.push(event);
          return { outcome: "recorded" };
        },
      },
      { now: () => 300 },
    );

    const event = loadFixture("fixtures/message-upsert.optional-field.json");
    const expectedRepositoryEvent = loadMapper()(event, 300);
    const result = await boundary.validateAndApply(event);

    expect(result).toEqual({ kind: "known", outcome: "applied" });
    expect(knownEvents).toEqual([expectedRepositoryEvent]);
    expect(unknownEvents).toEqual([]);
  });

  test("returns invalid without repository mutation when a required known payload field is absent", async () => {
    const knownEvents: CanonicalMessageUpsert[] = [];
    const unknownEvents: UnknownWireEvent[] = [];
    const boundary = loadBoundary()(
      {
        applyCanonicalMessageUpsert: async (event) => {
          knownEvents.push(event);
          return { outcome: "applied" };
        },
        recordUnknownEvent: async (event) => {
          unknownEvents.push(event);
          return { outcome: "recorded" };
        },
      },
      { now: () => 300 },
    );

    const result = await boundary.validateAndApply(
      loadFixture("fixtures/invalid/message-upsert.missing-required.json"),
    );

    expect(result.kind).toBe("invalid");
    expect(knownEvents).toEqual([]);
    expect(unknownEvents).toEqual([]);
  });

  test("returns invalid without repository mutation when a known payload timestamp is negative", async () => {
    const knownEvents: CanonicalMessageUpsert[] = [];
    const unknownEvents: UnknownWireEvent[] = [];
    const boundary = loadBoundary()(
      {
        applyCanonicalMessageUpsert: async (event) => {
          knownEvents.push(event);
          return { outcome: "applied" };
        },
        recordUnknownEvent: async (event) => {
          unknownEvents.push(event);
          return { outcome: "recorded" };
        },
      },
      { now: () => 300 },
    );
    const fixture = loadFixture("fixtures/message-upsert.optional-field.json");
    if (!isRecord(fixture) || !isRecord(fixture.payload)) {
      throw new Error(
        "The message.upsert fixture must contain a payload object.",
      );
    }

    const result = await boundary.validateAndApply({
      ...fixture,
      payload: { ...fixture.payload, created_at_ms: -1 },
    });

    expect(result.kind).toBe("invalid");
    expect(knownEvents).toEqual([]);
    expect(unknownEvents).toEqual([]);
  });

  test("records an unknown valid event exactly once per attempt and returns local request_delta recovery", async () => {
    const knownEvents: CanonicalMessageUpsert[] = [];
    const unknownEvents: UnknownWireEvent[] = [];
    const boundary = loadBoundary()(
      {
        applyCanonicalMessageUpsert: async (event) => {
          knownEvents.push(event);
          return { outcome: "applied" };
        },
        recordUnknownEvent: async (event) => {
          unknownEvents.push(event);
          return {
            outcome: unknownEvents.length === 1 ? "recorded" : "duplicate",
          };
        },
      },
      { now: () => 300 },
    );

    const event = loadFixture("fixtures/unknown-event.json");
    const firstResult = await boundary.validateAndApply(event);
    const secondResult = await boundary.validateAndApply(event);

    expect(firstResult).toEqual({
      kind: "unknown",
      outcome: "recorded",
      recovery: "request_delta",
    });
    expect(secondResult).toEqual({
      kind: "unknown",
      outcome: "duplicate",
      recovery: "request_delta",
    });
    expect(knownEvents).toEqual([]);
    expect(unknownEvents).toEqual([
      {
        conversationId: "fixture-conversation",
        eventId: "event-unknown-1",
        payloadJson: canonicalizeJson(event),
        recordedAtMs: 300,
        serverSequence: 2,
        type: "message.redacted",
      },
      {
        conversationId: "fixture-conversation",
        eventId: "event-unknown-1",
        payloadJson: canonicalizeJson(event),
        recordedAtMs: 300,
        serverSequence: 2,
        type: "message.redacted",
      },
    ]);
  });

  test("keeps contract sources free of manual REST DTOs, transport, auth, and production URL behavior", () => {
    const relativeFiles = listTypeScriptFiles(sourceRoot)
      .map((path) => path.slice(repositoryRoot.length + 1))
      .sort();

    expect(relativeFiles).toEqual(
      expect.arrayContaining([
        "src/core/contracts/generated/bootstrap-api.ts",
        "src/core/contracts/index.ts",
        "src/core/contracts/map-message-event.ts",
        "src/core/contracts/validate-wire.ts",
      ]),
    );

    const source = relativeFiles
      .map((relativePath) =>
        readFileSync(join(repositoryRoot, relativePath), "utf8"),
      )
      .join("\n");
    expect(source).toContain("Generated by openapi-typescript");
    expect(source).not.toMatch(/\bfetch\s*\(|\bWebSocket\b|\bEventSource\b/);
    expect(source).not.toMatch(
      /\b(?:Authorization|SecureStore|credential|session|bearer|https?:\/\/|wss?:\/\/)/i,
    );
    expect(source).not.toMatch(
      /(?:interface|type)\s+\w*(?:Request|Response|RestDto|ApiDto)\b/,
    );
  });
});
