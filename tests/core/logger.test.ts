type LogSeverity = "debug" | "info" | "warn" | "error";

type LogRecord = {
  event: string;
  severity: LogSeverity;
  metadata: Record<string, unknown>;
};

type SinkSpy = jest.Mock<void, [LogRecord]>;
type LoggerSink = Record<LogSeverity, SinkSpy>;
type Logger = {
  log: (
    event: string,
    severity: LogSeverity,
    metadata: Record<string, unknown>,
  ) => void;
};
type CreateLogger = (sink: LoggerSink) => Logger;
type LoggerModule = { createLogger?: unknown };
type UnknownRecord = Record<string, unknown>;

const REDACTION_MARKER = "[REDACTED]";
const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "credential",
  "message",
  "body",
  "content",
  "text",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
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

function loadCreateLogger(): CreateLogger {
  let loaded: LoggerModule;
  try {
    loaded = jest.requireActual<LoggerModule>("../../src/core/logging/logger");
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M3-I2 implementation missing: src/core/logging/logger.ts must exist before GREEN.",
      );
    }
    throw error;
  }

  if (typeof loaded.createLogger !== "function") {
    throw new Error(
      "M3-I2 implementation incomplete: logger.ts must export createLogger(sink).",
    );
  }

  return loaded.createLogger as CreateLogger;
}

function createSink(): LoggerSink {
  return {
    debug: jest.fn<void, [LogRecord]>(),
    info: jest.fn<void, [LogRecord]>(),
    warn: jest.fn<void, [LogRecord]>(),
    error: jest.fn<void, [LogRecord]>(),
  };
}

function getOnlyRecord(sink: LoggerSink, severity: LogSeverity): LogRecord {
  const calls = sink[severity].mock.calls;
  if (calls.length !== 1 || calls[0]?.length !== 1) {
    throw new Error(`Expected one ${severity} sink call with one record.`);
  }
  return calls[0][0];
}

function assertNoSentinelLeak(
  serialized: string,
  sentinels: readonly string[],
): void {
  if (new Set(sentinels).size !== sentinels.length) {
    throw new Error("Logger test fixture sentinels must be unique.");
  }
  if (sentinels.some((sentinel) => serialized.includes(sentinel))) {
    throw new Error("Serialized sink output contained a protected sentinel.");
  }
}

function assertContainsRedactionMarker(serialized: string): void {
  if (!serialized.includes(REDACTION_MARKER)) {
    throw new Error("Serialized sink output lacked the redaction marker.");
  }
}

function alternatingCase(value: string, offset: number): string {
  return [...value]
    .map((character, index) =>
      (index + offset) % 2 === 0
        ? character.toUpperCase()
        : character.toLowerCase(),
    )
    .join("");
}

function makeSensitiveEntries(scope: string, offset: number) {
  const keys: string[] = [];
  const sentinels: string[] = [];
  const values: UnknownRecord = {};

  SENSITIVE_KEYS.forEach((key, index) => {
    const variedKey = alternatingCase(key, index + offset);
    const sentinel = `opaque-${scope}-${String(index + 1).padStart(2, "0")}-value`;
    keys.push(variedKey);
    sentinels.push(sentinel);
    values[variedKey] = sentinel;
  });

  return { keys, sentinels, values };
}

function makeSensitiveKeyFixture() {
  const topLevel = makeSensitiveEntries("root-field", 0);
  const nested = makeSensitiveEntries("nested-field", 1);
  const arrayItem = makeSensitiveEntries("array-field", 2);

  return {
    metadata: {
      safeRoot: "safe-root-value",
      ...topLevel.values,
      nested: {
        safeNested: "safe-nested-value",
        ...nested.values,
      },
      items: [
        {
          safeArrayItem: "safe-array-value",
          ...arrayItem.values,
        },
      ],
    },
    sentinels: [
      ...topLevel.sentinels,
      ...nested.sentinels,
      ...arrayItem.sentinels,
    ],
    keys: {
      topLevel: topLevel.keys,
      nested: nested.keys,
      arrayItem: arrayItem.keys,
    },
  };
}

function makePatternFixture() {
  const sentinels = {
    bearer: "opaque-bearer-value-71c2",
    jwtHeader: "jwtHeaderOpaque71c2",
    jwtPayload: "jwtPayloadOpaque82d3",
    jwtSignature: "jwtSignatureOpaque93e4",
    tokenAssignment: "opaque-assignment-value-a1",
    secretAssignment: "opaque-assignment-value-b2",
    passwordAssignment: "opaque-assignment-value-c3",
  };

  return {
    metadata: {
      safeLabel: "safe-pattern-context",
      bearerPattern: `request used Bearer ${sentinels.bearer}`,
      jwtPattern: `${sentinels.jwtHeader}.${sentinels.jwtPayload}.${sentinels.jwtSignature}`,
      assignments: [
        `token=${sentinels.tokenAssignment}`,
        `secret: ${sentinels.secretAssignment}`,
        `password = ${sentinels.passwordAssignment}`,
      ],
    },
    sentinels: Object.values(sentinels),
  };
}

function makeErrorFixture() {
  const sentinels = {
    rawMessage: "opaque-error-primary-5d4f",
    rawCause: "opaque-error-secondary-6e5a",
  };
  const failure = new Error(sentinels.rawMessage);
  failure.name = "FixtureError";
  Object.defineProperty(failure, "cause", {
    configurable: true,
    enumerable: true,
    value: { reason: sentinels.rawCause },
  });

  return { failure, sentinels: Object.values(sentinels) };
}

function assertRedactedFields(
  container: unknown,
  keys: readonly string[],
  scope: string,
): void {
  if (!isRecord(container)) {
    throw new Error(`Logger did not preserve the ${scope} metadata object.`);
  }
  if (keys.some((key) => container[key] !== REDACTION_MARKER)) {
    throw new Error(`Sensitive key remained in ${scope} metadata.`);
  }
}

function serializedSinkOutput(sink: LoggerSink): string {
  const records = (["debug", "info", "warn", "error"] as const).flatMap(
    (severity) => sink[severity].mock.calls.map(([record]) => record),
  );
  return JSON.stringify(records);
}

describe("M3-I2 structured redacted local logger contract", () => {
  test("emits exact safe records through the matching severity sink", () => {
    const createLogger = loadCreateLogger();
    const sink = createSink();
    const logger = createLogger(sink);
    const severities: LogSeverity[] = ["debug", "info", "warn", "error"];

    severities.forEach((severity, index) => {
      logger.log(`fixture.${severity}`, severity, {
        attempt: index + 1,
        safe: true,
      });
    });

    severities.forEach((severity, index) => {
      const record = getOnlyRecord(sink, severity);
      expect(record).toEqual({
        event: `fixture.${severity}`,
        severity,
        metadata: { attempt: index + 1, safe: true },
      });
      expect(Object.keys(record).sort()).toEqual([
        "event",
        "metadata",
        "severity",
      ]);
    });
  });

  test("recursively redacts case-insensitive keys in objects and arrays", () => {
    const createLogger = loadCreateLogger();
    const fixture = makeSensitiveKeyFixture();
    const sink = createSink();

    createLogger(sink).log("fixture.sensitive-keys", "info", fixture.metadata);

    const record = getOnlyRecord(sink, "info");
    const nested = record.metadata.nested;
    const items = record.metadata.items;
    if (!Array.isArray(items) || items.length !== 1) {
      throw new Error("Logger did not preserve the metadata array structure.");
    }

    assertRedactedFields(record.metadata, fixture.keys.topLevel, "top-level");
    assertRedactedFields(nested, fixture.keys.nested, "nested");
    assertRedactedFields(items[0], fixture.keys.arrayItem, "array");
    if (
      record.metadata.safeRoot !== "safe-root-value" ||
      !isRecord(nested) ||
      nested.safeNested !== "safe-nested-value" ||
      !isRecord(items[0]) ||
      items[0].safeArrayItem !== "safe-array-value"
    ) {
      throw new Error("Logger did not preserve adjacent safe metadata.");
    }

    const serialized = serializedSinkOutput(sink);
    assertNoSentinelLeak(serialized, fixture.sentinels);
    assertContainsRedactionMarker(serialized);
  });

  test("redacts Bearer, JWT-like, and embedded secret assignments", () => {
    const createLogger = loadCreateLogger();
    const fixture = makePatternFixture();
    const sink = createSink();

    createLogger(sink).log("fixture.value-patterns", "warn", fixture.metadata);

    const record = getOnlyRecord(sink, "warn");
    if (record.metadata.safeLabel !== "safe-pattern-context") {
      throw new Error("Logger did not preserve safe pattern metadata.");
    }
    const serialized = serializedSinkOutput(sink);
    assertNoSentinelLeak(serialized, fixture.sentinels);
    assertContainsRedactionMarker(serialized);
  });

  test("normalizes Errors without raw message or cause data", () => {
    const createLogger = loadCreateLogger();
    const fixture = makeErrorFixture();
    const sink = createSink();

    createLogger(sink).log("fixture.error", "error", {
      failure: fixture.failure,
      safeContext: "safe-error-context",
    });

    const record = getOnlyRecord(sink, "error");
    const failure = record.metadata.failure;
    if (
      !isRecord(failure) ||
      failure.name !== "FixtureError" ||
      Object.keys(failure).length !== 1
    ) {
      throw new Error("Logger did not preserve only the safe Error name.");
    }
    if (record.metadata.safeContext !== "safe-error-context") {
      throw new Error("Logger did not preserve safe Error context.");
    }
    assertNoSentinelLeak(serializedSinkOutput(sink), fixture.sentinels);
  });

  test("keeps every unique sentinel out of serialized sink output", () => {
    const createLogger = loadCreateLogger();
    const keyFixture = makeSensitiveKeyFixture();
    const patternFixture = makePatternFixture();
    const errorFixture = makeErrorFixture();
    const allSentinels = [
      ...keyFixture.sentinels,
      ...patternFixture.sentinels,
      ...errorFixture.sentinels,
    ];
    const sink = createSink();

    createLogger(sink).log("fixture.all-redactions", "debug", {
      ...keyFixture.metadata,
      patternFixture: patternFixture.metadata,
      failure: errorFixture.failure,
    });

    const serialized = serializedSinkOutput(sink);
    assertNoSentinelLeak(serialized, allSentinels);
    assertContainsRedactionMarker(serialized);
  });
});
