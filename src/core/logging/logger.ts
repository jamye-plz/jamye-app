export type LogSeverity = "debug" | "info" | "warn" | "error";

export type LogMetadata = Record<string, unknown>;

export type StructuredLogRecord = {
  event: string;
  severity: LogSeverity;
  metadata: LogMetadata;
};

export type LoggerSink = Record<
  LogSeverity,
  (record: StructuredLogRecord) => void
>;

export type StructuredLogger = {
  log: (event: string, severity: LogSeverity, metadata: LogMetadata) => void;
};

const REDACTION_MARKER = "[REDACTED]";
const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "credential",
  "message",
  "body",
  "content",
  "text",
]);

const ASSIGNMENT_PATTERN =
  /(\b(?:token|secret|password)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&)\]}]+)/gi;
const BEARER_PATTERN = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const JWT_PATTERN =
  /(^|[^A-Za-z0-9_-])(?:[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+(?=$|[^A-Za-z0-9_-])/g;

function sanitizeString(value: string): string {
  return value
    .replace(ASSIGNMENT_PATTERN, `$1${REDACTION_MARKER}`)
    .replace(BEARER_PATTERN, `$1${REDACTION_MARKER}`)
    .replace(JWT_PATTERN, `$1${REDACTION_MARKER}`);
}

function sanitizeError(error: Error): { name: string } {
  return { name: sanitizeString(error.name) };
}

function sanitizeRecord(
  value: LogMetadata,
  ancestors: WeakSet<object>,
): LogMetadata {
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTION_MARKER
        : sanitizeValue(nestedValue, ancestors),
    ]),
  );
}

function sanitizeValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (value instanceof Error) return sanitizeError(value);
  if (typeof value !== "object" || value === null) return value;
  if (ancestors.has(value)) return REDACTION_MARKER;

  ancestors.add(value);
  const sanitized = Array.isArray(value)
    ? value.map((item) => sanitizeValue(item, ancestors))
    : sanitizeRecord(value as LogMetadata, ancestors);
  ancestors.delete(value);
  return sanitized;
}

function sanitizeMetadata(metadata: LogMetadata): LogMetadata {
  return sanitizeRecord(metadata, new WeakSet([metadata]));
}

export function createLogger(sink: LoggerSink): StructuredLogger {
  return {
    log(event, severity, metadata) {
      const record: StructuredLogRecord = {
        event,
        severity,
        metadata: sanitizeMetadata(metadata),
      };
      sink[severity](record);
    },
  };
}
