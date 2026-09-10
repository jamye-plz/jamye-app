import { parsePublicApiOrigin } from "@/core/config/public-env";
import {
  mapCanonicalChatMessage,
  mapChatMessagePage,
  mapChatReadMarker,
  mapChatroomPage,
  validateCanonicalMessage,
  validateChatroomPage,
  validateDenormalizedMessagePage,
  validateErrorEnvelope,
  validateMessageCreate,
  validateReadCursorIn,
  validateReadMarker,
} from "@/core/contracts/server";
import type {
  CanonicalChatMessage,
  ChatMessagePage,
  ChatReadMarker,
  ChatroomPage,
} from "@/core/contracts/server";
import {
  HttpAbortedError,
  REQUEST_TIMEOUT_MS,
  parseJsonResponseBody,
  withTimeoutSignal,
} from "@/core/http/http-client";

const CHAT_IDENTIFIER_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ChatApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}

export type ChatPageParams = Readonly<{ after?: string; limit?: number }>;
export type ChatHistoryParams = Readonly<{ before?: string; limit?: number }>;

/** C3 accepts only the currently-imported cursor anchor; a message_id anchor
 * is a pending additive intake step gated on the backend contract handoff. */
export type ChatReadInput = Readonly<{ cursor: string }>;

export type ChatSendInput = Readonly<{
  clientMessageId: string;
  body: string;
}>;

export type ChatMessageSendResult = Readonly<{
  status: 200 | 201;
  message: CanonicalChatMessage;
}>;

export type ChatApi = Readonly<{
  listGroupChatrooms: (
    accessToken: string,
    groupId: string,
    params: ChatPageParams,
    signal?: AbortSignal,
  ) => Promise<ChatroomPage>;
  listChatroomMessages: (
    accessToken: string,
    chatroomId: string,
    params: ChatHistoryParams,
    signal?: AbortSignal,
  ) => Promise<ChatMessagePage>;
  markChatroomRead: (
    accessToken: string,
    chatroomId: string,
    input: ChatReadInput,
    signal?: AbortSignal,
  ) => Promise<ChatReadMarker>;
  sendChatMessage: (
    accessToken: string,
    chatroomId: string,
    input: ChatSendInput,
    signal?: AbortSignal,
  ) => Promise<ChatMessageSendResult>;
}>;

function validateLimit(limit: number | undefined): void {
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > 100)
  ) {
    throw new ChatApiError(422, "invalid_page_limit");
  }
}

function buildPageQuery(
  cursorParameterName: "after" | "before",
  cursor: string | undefined,
  limit: number | undefined,
): string {
  const query = new URLSearchParams();
  if (cursor !== undefined) query.set(cursorParameterName, cursor);
  if (limit !== undefined) query.set("limit", String(limit));
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function parseRetryAfterSeconds(header: string | null): number | null {
  if (header === null || !/^[0-9]+$/.test(header)) return null;
  const seconds = Number(header);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function identifier(value: string): string {
  if (!CHAT_IDENTIFIER_PATTERN.test(value))
    throw new ChatApiError(422, "invalid_identifier");
  return encodeURIComponent(value);
}

export function createChatApi(origin: string): ChatApi {
  const apiOrigin = parsePublicApiOrigin(origin);

  async function request(
    path: string,
    accessToken: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
    expectedStatuses: readonly number[],
    extraHeaders?: Readonly<Record<string, string>>,
  ): Promise<{ payload: unknown; status: number }> {
    try {
      const { status, ok, payload, retryAfterSeconds } =
        await withTimeoutSignal(
          signal,
          REQUEST_TIMEOUT_MS,
          async (composedSignal) => {
            const response = await fetch(`${apiOrigin}${path}`, {
              ...init,
              credentials: "omit",
              redirect: "error",
              signal: composedSignal,
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
                ...(init.body ? { "Content-Type": "application/json" } : {}),
                ...extraHeaders,
              },
            });
            const body = await parseJsonResponseBody(response);
            return {
              status: response.status,
              ok: response.ok,
              payload: body,
              retryAfterSeconds: parseRetryAfterSeconds(
                response.headers.get("retry-after"),
              ),
            };
          },
        );
      if (!ok) {
        const code = validateErrorEnvelope(payload)
          ? payload.error.code
          : "request_failed";
        throw new ChatApiError(
          status,
          code,
          status === 429 ? retryAfterSeconds : null,
        );
      }
      if (!expectedStatuses.includes(status))
        throw new ChatApiError(502, "invalid_response_status");
      return { payload, status };
    } catch (error) {
      if (error instanceof ChatApiError) throw error;
      if (error instanceof HttpAbortedError)
        throw error.by === "caller"
          ? new ChatApiError(0, "request_cancelled")
          : new ChatApiError(408, "request_timeout");
      throw new ChatApiError(0, "network_unavailable");
    }
  }

  return {
    async listGroupChatrooms(accessToken, groupId, params, signal) {
      validateLimit(params.limit);
      const { payload } = await request(
        `/api/v1/groups/${identifier(groupId)}/chatrooms${buildPageQuery("after", params.after, params.limit)}`,
        accessToken,
        {},
        signal,
        [200],
      );
      if (!validateChatroomPage(payload))
        throw new ChatApiError(502, "invalid_chatroom_page_response");
      return mapChatroomPage(payload);
    },
    async listChatroomMessages(accessToken, chatroomId, params, signal) {
      validateLimit(params.limit);
      const { payload } = await request(
        `/api/v1/chatrooms/${identifier(chatroomId)}/messages${buildPageQuery("before", params.before, params.limit)}`,
        accessToken,
        {},
        signal,
        [200],
      );
      if (!validateDenormalizedMessagePage(payload))
        throw new ChatApiError(502, "invalid_message_page_response");
      return mapChatMessagePage(payload);
    },
    async markChatroomRead(accessToken, chatroomId, input, signal) {
      const body = { cursor: input.cursor };
      if (!validateReadCursorIn(body))
        throw new ChatApiError(422, "invalid_read_cursor");
      const { payload } = await request(
        `/api/v1/chatrooms/${identifier(chatroomId)}/read`,
        accessToken,
        { method: "POST", body: JSON.stringify(body) },
        signal,
        [200],
      );
      if (!validateReadMarker(payload))
        throw new ChatApiError(502, "invalid_read_marker_response");
      return mapChatReadMarker(payload);
    },
    async sendChatMessage(accessToken, chatroomId, input, signal) {
      const body = {
        body: input.body,
        client_msg_id: input.clientMessageId,
      };
      if (!validateMessageCreate(body))
        throw new ChatApiError(422, "invalid_message_create");
      const { payload, status } = await request(
        `/api/v1/chatrooms/${identifier(chatroomId)}/messages`,
        accessToken,
        { method: "POST", body: JSON.stringify(body) },
        signal,
        [200, 201],
        { "Idempotency-Key": input.clientMessageId },
      );
      if (!validateCanonicalMessage(payload))
        throw new ChatApiError(502, "invalid_message_response");
      return {
        message: mapCanonicalChatMessage(payload),
        status: status as 200 | 201,
      };
    },
  };
}
