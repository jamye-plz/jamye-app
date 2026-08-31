import Ajv2020 from "ajv/dist/2020";

import type { DatabaseRepository } from "../database/repositories/database-repository";
import realtimeEventSchema from "../../../contracts/bootstrap/realtime-event.schema.json";

import { canonicalizeJson } from "./canonical-json";
import { mapMessageUpsertEvent } from "./map-message-event";

type JsonRecord = Record<string, unknown>;

export type WireEventBoundaryOptions = Readonly<{
  now: () => number;
}>;

export type WireEventRepository = Pick<
  DatabaseRepository,
  "applyCanonicalMessageUpsert" | "recordUnknownEvent"
>;

export type WireEventResult =
  | Readonly<{ kind: "invalid"; issues: readonly string[] }>
  | Readonly<{ kind: "known"; outcome: "applied" | "duplicate" }>
  | Readonly<{
      kind: "unknown";
      outcome: "recorded" | "duplicate";
      recovery: "request_delta";
    }>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownMessageUpsert(event: unknown): boolean {
  return isRecord(event) && event.type === "message.upsert";
}

function validationIssues(
  errors:
    | readonly Readonly<{ instancePath: string; message?: string }>[]
    | null
    | undefined,
): readonly string[] {
  if (!errors || errors.length === 0) {
    return ["Wire event does not satisfy the bootstrap schema."];
  }

  return errors.map(
    (error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  );
}

const validator = new Ajv2020({ allErrors: true, strict: false }).compile(
  realtimeEventSchema,
);

export function createWireEventBoundary(
  repository: WireEventRepository,
  options: WireEventBoundaryOptions,
): Readonly<{
  validateAndApply: (event: unknown) => Promise<WireEventResult>;
}> {
  return {
    async validateAndApply(event: unknown): Promise<WireEventResult> {
      if (!validator(event)) {
        return { kind: "invalid", issues: validationIssues(validator.errors) };
      }

      if (!isRecord(event)) {
        return {
          kind: "invalid",
          issues: ["Wire event must be an object after validation."],
        };
      }

      const recordedAtMs = options.now();
      if (isKnownMessageUpsert(event)) {
        const result = await repository.applyCanonicalMessageUpsert(
          mapMessageUpsertEvent(event, recordedAtMs),
        );
        return { kind: "known", outcome: result.outcome };
      }

      const result = await repository.recordUnknownEvent({
        conversationId: event.conversation_id as string,
        eventId: event.event_id as string,
        payloadJson: canonicalizeJson(event),
        recordedAtMs,
        serverSequence: event.server_sequence as number,
        type: event.type as string,
      });
      return {
        kind: "unknown",
        outcome: result.outcome,
        recovery: "request_delta",
      };
    },
  };
}
