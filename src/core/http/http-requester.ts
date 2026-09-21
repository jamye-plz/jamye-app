import { parsePublicApiOrigin } from "@/core/config/public-env";
import { validateErrorEnvelope } from "@/core/contracts/server";
import {
  HttpAbortedError,
  REQUEST_TIMEOUT_MS,
  parseJsonResponseBody,
  withTimeoutSignal,
} from "@/core/http/http-client";

/**
 * Shared HTTP boilerplate reused across feature API clients (notifications,
 * push installations, account, ...): every client wraps the same
 * fetch/timeout/abort/status-mapping shape but must keep its own error class
 * (`NotificationApiError` / `PushInstallationApiError` / `AccountApiError`)
 * so callers keep catching the class they already depend on.
 * `createError`/`isApiError` let each caller supply its own error identity
 * while this module owns only the mechanical request/response plumbing.
 */

export function parseRetryAfterSeconds(header: string | null): number | null {
  if (header === null || !/^[0-9]+$/.test(header)) return null;
  const seconds = Number(header);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

export type HttpRequestFn = (
  path: string,
  accessToken: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  expectedStatuses: readonly number[],
) => Promise<{ payload: unknown; status: number }>;

export function createHttpRequester<TError extends Error>(
  origin: string,
  createError: (
    status: number,
    code: string,
    retryAfterSeconds?: number | null,
  ) => TError,
  isApiError: (error: unknown) => error is TError,
): HttpRequestFn {
  const apiOrigin = parsePublicApiOrigin(origin);

  return async function request(
    path,
    accessToken,
    init,
    signal,
    expectedStatuses,
  ) {
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
        throw createError(
          status,
          code,
          status === 429 ? retryAfterSeconds : null,
        );
      }
      if (!expectedStatuses.includes(status))
        throw createError(502, "invalid_response_status");
      return { payload, status };
    } catch (error) {
      if (isApiError(error)) throw error;
      if (error instanceof HttpAbortedError)
        throw error.by === "caller"
          ? createError(0, "request_cancelled")
          : createError(408, "request_timeout");
      throw createError(0, "network_unavailable");
    }
  };
}
