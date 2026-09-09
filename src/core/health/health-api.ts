import { parsePublicApiOrigin } from "@/core/config/public-env";
import {
  type HealthLiveness,
  type HealthReadiness,
  mapLiveness,
  mapReadiness,
} from "@/core/contracts/server/domain";
import {
  validateLivenessResponse,
  validateReadinessResponse,
} from "@/core/contracts/server/validators";
import {
  HttpAbortedError,
  REQUEST_TIMEOUT_MS,
  withTimeoutSignal,
} from "@/core/http/http-client";

export class HealthApiError extends Error {
  constructor(
    readonly code:
      | "cancelled"
      | "timeout"
      | "network_unavailable"
      | "invalid_response"
      | "http_error",
    readonly status?: number,
  ) {
    super(code);
  }
}

export type HealthApi = Readonly<{
  liveness: (signal?: AbortSignal) => Promise<HealthLiveness>;
  readiness: (signal?: AbortSignal) => Promise<HealthReadiness>;
}>;

export function createHealthApi(origin: string): HealthApi {
  const normalizedOrigin = parsePublicApiOrigin(origin);
  return {
    async liveness(signal) {
      const body = await requestHealth(
        normalizedOrigin,
        "/health/live",
        [200],
        signal,
      );
      if (!validateLivenessResponse(body))
        throw new HealthApiError("invalid_response");
      return mapLiveness(body);
    },
    async readiness(signal) {
      const body = await requestHealth(
        normalizedOrigin,
        "/health/ready",
        [200, 503],
        signal,
      );
      if (!validateReadinessResponse(body))
        throw new HealthApiError("invalid_response");
      return mapReadiness(body);
    },
  };
}

async function requestHealth(
  origin: string,
  path: "/health/live" | "/health/ready",
  acceptedStatuses: readonly number[],
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) throw new HealthApiError("cancelled");
  try {
    return await withTimeoutSignal(
      signal,
      REQUEST_TIMEOUT_MS,
      async (requestSignal) => {
        const response = await fetch(`${origin}${path}`, {
          headers: { Accept: "application/json" },
          credentials: "omit",
          redirect: "error",
          signal: requestSignal,
        });
        if (!acceptedStatuses.includes(response.status)) {
          throw new HealthApiError("http_error", response.status);
        }
        return readHealthBody(response);
      },
    );
  } catch (error) {
    if (error instanceof HealthApiError) throw error;
    if (error instanceof HttpAbortedError) {
      throw new HealthApiError(error.by === "caller" ? "cancelled" : "timeout");
    }
    throw new HealthApiError("network_unavailable");
  }
}

async function readHealthBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new HealthApiError("invalid_response");
  }
}
