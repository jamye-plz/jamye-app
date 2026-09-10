import { parsePublicApiOrigin } from "@/core/config/public-env";
import {
  realtimeProtocol,
  validateErrorEnvelope,
  validateEventPage,
  validateRealtimeTicket,
} from "@/core/contracts/server";
import type {
  EventPageWire,
  RealtimeTicketWire,
} from "@/core/contracts/server";
import {
  HttpAbortedError,
  REQUEST_TIMEOUT_MS,
  parseJsonResponseBody,
  withTimeoutSignal,
} from "@/core/http/http-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SyncApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}

export type SyncApi = Readonly<{
  listEvents: (
    token: string,
    conversationId: string,
    params: Readonly<{ after?: string; limit?: number }>,
    signal?: AbortSignal,
  ) => Promise<EventPageWire>;
  issueTicket: (
    token: string,
    signal?: AbortSignal,
  ) => Promise<RealtimeTicketWire>;
}>;

function retryAfterSeconds(raw: string | null): number | null {
  if (raw === null) return null;
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
    : null;
}

export function realtimeSocketUrl(origin: string, ticket: string): string {
  const url = new URL("/api/v1/realtime/ws", parsePublicApiOrigin(origin));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

/** Only this adapter performs S1/R1 HTTP. The caller owns authorizedRequest,
 * retries and epoch fencing; neither bearer tokens nor tickets are logged. */
export function createSyncApi(origin: string): SyncApi {
  const apiOrigin = parsePublicApiOrigin(origin);
  async function request(
    path: string,
    token: string,
    method: "GET" | "POST",
    expectedStatus: number,
    signal?: AbortSignal,
  ) {
    try {
      const result = await withTimeoutSignal(
        signal,
        REQUEST_TIMEOUT_MS,
        async (composedSignal) => {
          const response = await fetch(`${apiOrigin}${path}`, {
            method,
            credentials: "omit",
            redirect: "error",
            signal: composedSignal,
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
              [realtimeProtocol.contract_versions.request_header]:
                realtimeProtocol.contract_versions.current,
            },
          });
          return {
            status: response.status,
            payload: await parseJsonResponseBody(response),
            retryAfter: retryAfterSeconds(response.headers.get("retry-after")),
          };
        },
      );
      if (result.status !== expectedStatus) {
        if (result.status >= 200 && result.status < 300)
          throw new SyncApiError(502, "invalid_response_status");
        throw new SyncApiError(
          result.status,
          validateErrorEnvelope(result.payload)
            ? result.payload.error.code
            : "request_failed",
          result.status === 429 ? result.retryAfter : null,
        );
      }
      return result.payload;
    } catch (error) {
      if (error instanceof SyncApiError) throw error;
      if (error instanceof HttpAbortedError)
        throw new SyncApiError(
          error.by === "caller" ? 0 : 408,
          error.by === "caller" ? "request_cancelled" : "request_timeout",
        );
      throw new SyncApiError(0, "network_unavailable");
    }
  }
  return {
    async listEvents(token, conversationId, { after, limit }, signal) {
      if (
        !UUID.test(conversationId) ||
        (limit !== undefined &&
          (!Number.isInteger(limit) || limit < 1 || limit >= 2 ** 31))
      )
        throw new SyncApiError(422, "invalid_delta_request");
      const query = new URLSearchParams();
      if (after !== undefined) query.set("after", after);
      if (limit !== undefined) query.set("limit", String(limit));
      const queryString = query.toString();
      const suffix = queryString ? `?${queryString}` : "";
      const payload = await request(
        `/api/v1/conversations/${conversationId}/events${suffix}`,
        token,
        "GET",
        200,
        signal,
      );
      if (!validateEventPage(payload))
        throw new SyncApiError(502, "invalid_event_page");
      return payload;
    },
    async issueTicket(token, signal) {
      const payload = await request(
        "/api/v1/realtime/tickets",
        token,
        "POST",
        201,
        signal,
      );
      if (!validateRealtimeTicket(payload))
        throw new SyncApiError(502, "invalid_realtime_ticket");
      return payload;
    },
  };
}
