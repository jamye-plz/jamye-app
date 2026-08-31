import type { CanonicalMessageUpsert } from "../database/repositories/database-repository";

import { canonicalizeJson } from "./canonical-json";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer.`);
  }
  return value;
}

export function mapMessageUpsertEvent(
  event: unknown,
  recordedAtMs: number,
): CanonicalMessageUpsert {
  if (!isRecord(event) || !isRecord(event.payload)) {
    throw new Error(
      "message.upsert must be a wire envelope with an object payload.",
    );
  }

  const payload = event.payload;
  const clientMsgId = payload.client_msg_id;
  if (clientMsgId !== null && typeof clientMsgId !== "string") {
    throw new Error("payload.client_msg_id must be a string or null.");
  }

  return {
    conversationId: requireNonEmptyString(
      event.conversation_id,
      "conversation_id",
    ),
    cursor: requireNonEmptyString(event.cursor, "cursor"),
    eventId: requireNonEmptyString(event.event_id, "event_id"),
    message: {
      body: requireNonEmptyString(payload.body, "payload.body"),
      clientMsgId,
      createdAtMs: requireInteger(
        payload.created_at_ms,
        "payload.created_at_ms",
      ),
      localId: requireNonEmptyString(payload.message_id, "payload.message_id"),
      senderId: requireNonEmptyString(payload.sender_id, "payload.sender_id"),
    },
    payloadJson: canonicalizeJson(event),
    recordedAtMs,
    serverSequence: requireInteger(event.server_sequence, "server_sequence"),
  };
}
