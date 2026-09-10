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
export type GroupWire = components["schemas"]["Group"];
export type GroupCreateWire = components["schemas"]["GroupCreate"];
export type GroupPatchWire = components["schemas"]["GroupPatch"];
export type GroupPageWire = components["schemas"]["GroupPage"];
export type MemberWire = components["schemas"]["Member"];
export type MemberPageWire = components["schemas"]["MemberPage"];
export type MemberRolePatchWire = components["schemas"]["MemberRolePatch"];
export type InviteWire = components["schemas"]["Invite"];
export type InviteCreateWire = components["schemas"]["InviteCreate"];
export type InviteJoinResultWire = components["schemas"]["InviteJoinResult"];
export type ChatroomWire = components["schemas"]["Chatroom"];
export type ChatroomPageWire = components["schemas"]["ChatroomPage"];
export type DenormalizedMessageWire =
  components["schemas"]["DenormalizedMessage"];
export type DenormalizedMessagePageWire =
  components["schemas"]["DenormalizedMessagePage"];
export type MessageAttachmentWire = components["schemas"]["MessageAttachment"];
export type MessageCreateWire = components["schemas"]["MessageCreate"];
export type CanonicalMessageWire = components["schemas"]["CanonicalMessage"];
export type ReadAnchorInWire = components["schemas"]["ReadAnchorIn"];
export type ReadCursorInWire = components["schemas"]["ReadCursorIn"];
export type ReadMarkerWire = components["schemas"]["ReadMarker"];

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
export const validateGroup = compileComponentSchema("Group");
export const validateGroupCreate = compileComponentSchema("GroupCreate");
export const validateGroupPatch = compileComponentSchema("GroupPatch");
export const validateGroupPage = compileComponentSchema("GroupPage");
export const validateMember = compileComponentSchema("Member");
export const validateMemberPage = compileComponentSchema("MemberPage");
export const validateMemberRolePatch =
  compileComponentSchema("MemberRolePatch");
export const validateInvite = compileComponentSchema("Invite");
export const validateInviteCreate = compileComponentSchema("InviteCreate");
export const validateInviteJoinResult =
  compileComponentSchema("InviteJoinResult");
export const validateChatroom = compileComponentSchema("Chatroom");
export const validateChatroomPage = compileComponentSchema("ChatroomPage");
export const validateDenormalizedMessage = compileComponentSchema(
  "DenormalizedMessage",
);
export const validateDenormalizedMessagePage = compileComponentSchema(
  "DenormalizedMessagePage",
);
export const validateMessageCreate = compileComponentSchema("MessageCreate");
export const validateCanonicalMessage =
  compileComponentSchema("CanonicalMessage");
export const validateReadAnchorIn = compileComponentSchema("ReadAnchorIn");
export const validateReadCursorIn = compileComponentSchema("ReadCursorIn");
export const validateReadMarker = compileComponentSchema("ReadMarker");

const OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// I2's path parameter (GET /api/v1/invites/{code}/join) is declared with only
// minLength:1 in the imported OpenAPI snapshot; the server's actual runtime
// constraint (16-64 ASCII alphanumeric/underscore/hyphen, matching the Invite
// schema's own `code` field) is asserted here rather than by hand-editing the
// preserved upstream snapshot. See m7-contract-notes-20260909-183326.md.
const INVITE_JOIN_CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function isValidInviteJoinCode(value: string): boolean {
  return INVITE_JOIN_CODE_PATTERN.test(value);
}

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
