import Ajv2020 from "ajv/dist/2020";

import serverOpenApi from "../../../../contracts/server/openapi.json";
import type { components } from "../generated/server/server-api";

import { registerServerContractFormats } from "./formats";

const SCHEMA_ROOT_ID = "https://jamye.local/contracts/server";

type OpenApiComponentsDocument = Readonly<{
  components: Readonly<{ schemas: Record<string, unknown> }>;
}>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
registerServerContractFormats(ajv);
ajv.addSchema({
  $id: SCHEMA_ROOT_ID,
  components: (serverOpenApi as unknown as OpenApiComponentsDocument)
    .components,
});

function compileComponentSchema<K extends keyof components["schemas"]>(
  schemaName: K,
): (value: unknown) => value is components["schemas"][K] {
  const validate = ajv.compile<components["schemas"][K]>({
    $ref: `${SCHEMA_ROOT_ID}#/components/schemas/${schemaName}`,
  });
  return (value: unknown): value is components["schemas"][K] => validate(value);
}

export type LivenessResponseWire = components["schemas"]["LivenessResponse"];
export type DependencyStatusWire = components["schemas"]["DependencyStatus"];
export type DependencyCheckWire = components["schemas"]["DependencyCheck"];
export type ReadinessResponseWire = components["schemas"]["ReadinessResponse"];
export type OAuthAuthorizeInWire = components["schemas"]["OAuthAuthorizeIn"];
export type OAuthAuthorizeOutWire = components["schemas"]["OAuthAuthorizeOut"];
export type OAuthExchangeInWire = components["schemas"]["OAuthExchangeIn"];
export type RefreshInWire = components["schemas"]["RefreshIn"];
export type TokenPairWire = components["schemas"]["TokenPair"];
export type UserWire = components["schemas"]["User"];
export type ErrorEnvelopeWire = components["schemas"]["ErrorEnvelope"];

export const validateLivenessResponse =
  compileComponentSchema("LivenessResponse");
export const validateReadinessResponse =
  compileComponentSchema("ReadinessResponse");
export const validateOAuthAuthorizeIn =
  compileComponentSchema("OAuthAuthorizeIn");
export const validateOAuthAuthorizeOut =
  compileComponentSchema("OAuthAuthorizeOut");
export const validateOAuthExchangeIn =
  compileComponentSchema("OAuthExchangeIn");
export const validateRefreshIn = compileComponentSchema("RefreshIn");
export const validateTokenPair = compileComponentSchema("TokenPair");
export const validateUser = compileComponentSchema("User");
export const validateErrorEnvelope = compileComponentSchema("ErrorEnvelope");

const OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type OAuthCallbackQuery =
  | Readonly<{
      outcome: "authorized";
      provider: string;
      state: string;
      code: string;
    }>
  | Readonly<{
      outcome: "denied";
      provider: string;
      state: string;
      error: string;
    }>;

/**
 * A5 (`GET /api/v1/auth/oauth/{provider}/callback`) is a browser-only HTTPS
 * bridge that returns a 302 redirect with no JSON body; it is never fetched
 * as a JSON operation. This validates only the query parameters the mobile
 * client observes when the system browser redirects back into the app.
 */
export function parseOAuthCallbackQuery(
  provider: string,
  query: Readonly<Record<string, string | undefined>>,
): OAuthCallbackQuery | Readonly<{ issues: readonly string[] }> {
  const issues: string[] = [];
  const state = query.state;
  const code = query.code;
  const error = query.error;

  if (typeof state !== "string" || !OAUTH_STATE_PATTERN.test(state)) {
    issues.push("state must be the exact 43-character authorize state.");
  }
  const hasCode = typeof code === "string" && code.length > 0;
  const hasError = typeof error === "string" && error.length > 0;
  if (hasCode === hasError) {
    issues.push("exactly one of code or error must be present.");
  }
  if (hasCode && (code as string).length > 4096) {
    issues.push("code must be at most 4096 characters.");
  }
  if (hasError && (error as string).length > 1024) {
    issues.push("error must be at most 1024 characters.");
  }
  if (issues.length > 0) return { issues };

  return hasCode
    ? {
        code: code as string,
        outcome: "authorized",
        provider,
        state: state as string,
      }
    : {
        error: error as string,
        outcome: "denied",
        provider,
        state: state as string,
      };
}
