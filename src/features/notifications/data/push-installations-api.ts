import {
  expoInstallationCreateToWire,
  expoInstallationPutToWire,
  mapPushInstallation,
  validateExpoInstallationCreate,
  validateExpoInstallationPut,
  validatePushInstallation,
} from "@/core/contracts/server";
import type {
  ExpoInstallationCreateInput,
  ExpoInstallationPutInput,
  PushInstallation,
} from "@/core/contracts/server";

import { createHttpRequester } from "./notifications-http";

export class PushInstallationApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}

/**
 * Canonical DI-seam shape (method names `create`/`update`/`remove`): A2's
 * push-lifecycle.ts declares this same structural shape locally as its
 * injected port so it never imports this file (keeping A1/A2 independent
 * tier-1 tasks); tier-2 tasks wire this concrete instance in.
 */
export type PushInstallationsPort = Readonly<{
  create: (
    accessToken: string,
    body: ExpoInstallationCreateInput,
    signal?: AbortSignal,
  ) => Promise<PushInstallation>;
  update: (
    accessToken: string,
    installationId: string,
    body: ExpoInstallationPutInput,
    signal?: AbortSignal,
  ) => Promise<PushInstallation>;
  remove: (
    accessToken: string,
    installationId: string,
    signal?: AbortSignal,
  ) => Promise<void>;
}>;

function identifier(value: string): string {
  if (value.length < 1 || value.length > 255)
    throw new PushInstallationApiError(422, "invalid_installation_id");
  return encodeURIComponent(value);
}

function validateCreateInput(input: ExpoInstallationCreateInput): void {
  if (input.platform !== "ios" && input.platform !== "android")
    throw new PushInstallationApiError(422, "invalid_platform");
  if (input.environment !== "development" && input.environment !== "production")
    throw new PushInstallationApiError(422, "invalid_environment");
  if (input.installationId.length < 1 || input.installationId.length > 255)
    throw new PushInstallationApiError(422, "invalid_installation_id");
  if (input.expoToken.length < 1 || input.expoToken.length > 512)
    throw new PushInstallationApiError(422, "invalid_expo_token");
}

function validatePutInput(input: ExpoInstallationPutInput): void {
  if (input.expoToken.length < 1 || input.expoToken.length > 512)
    throw new PushInstallationApiError(422, "invalid_expo_token");
}

export function createPushInstallationsApi(
  origin: string,
): PushInstallationsPort {
  const request = createHttpRequester(
    origin,
    (status, code, retryAfterSeconds = null) =>
      new PushInstallationApiError(status, code, retryAfterSeconds),
    (error): error is PushInstallationApiError =>
      error instanceof PushInstallationApiError,
  );

  return {
    async create(accessToken, body, signal) {
      validateCreateInput(body);
      const wireBody = expoInstallationCreateToWire(body);
      if (!validateExpoInstallationCreate(wireBody))
        throw new PushInstallationApiError(422, "invalid_installation_create");
      const { payload } = await request(
        "/api/v1/push/installations",
        accessToken,
        { method: "POST", body: JSON.stringify(wireBody) },
        signal,
        [200, 201],
      );
      if (!validatePushInstallation(payload))
        throw new PushInstallationApiError(
          502,
          "invalid_installation_response",
        );
      return mapPushInstallation(payload);
    },
    async update(accessToken, installationId, body, signal) {
      validatePutInput(body);
      const wireBody = expoInstallationPutToWire(body);
      if (!validateExpoInstallationPut(wireBody))
        throw new PushInstallationApiError(422, "invalid_installation_put");
      const { payload } = await request(
        `/api/v1/push/installations/${identifier(installationId)}`,
        accessToken,
        { method: "PUT", body: JSON.stringify(wireBody) },
        signal,
        [200],
      );
      if (!validatePushInstallation(payload))
        throw new PushInstallationApiError(
          502,
          "invalid_installation_response",
        );
      return mapPushInstallation(payload);
    },
    async remove(accessToken, installationId, signal) {
      await request(
        `/api/v1/push/installations/${identifier(installationId)}`,
        accessToken,
        { method: "DELETE" },
        signal,
        [204],
      );
    },
  };
}
