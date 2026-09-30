import Ajv2020 from "ajv/dist/2020";

import serverOpenApi from "../../../../contracts/server/openapi.json";
import realtimeClientFrameSchema from "../../../../contracts/server/realtime/client-frame.schema.json";
import realtimeMessageCreatedFrameSchema from "../../../../contracts/server/realtime/message.created.schema.json";
import realtimeMessageDeletedFrameSchema from "../../../../contracts/server/realtime/message.deleted.schema.json";
import realtimeProtocolDocument from "../../../../contracts/server/realtime/protocol.json";
import realtimeServerFrameSchema from "../../../../contracts/server/realtime/server-frame.schema.json";
import realtimeTopicCreatedFrameSchema from "../../../../contracts/server/realtime/topic.created.schema.json";
import realtimeTopicDeletedFrameSchema from "../../../../contracts/server/realtime/topic.deleted.schema.json";
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
export type UserPatchWire = components["schemas"]["UserPatch"];
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
// APPCON-AC1/AC2 (A6, plan api_contracts.server.A6_POST_/api/v1/auth/apple/exchange):
// the Apple exchange request body. `full_name` is optional (maxLength 256);
// the no-control-character rule is enforced by auth-controller.ts's
// sendableFullName gate, not by this ajv shape.
export type AppleExchangeInWire = components["schemas"]["AppleExchangeIn"];
export const validateAppleExchangeIn =
  compileComponentSchema("AppleExchangeIn");
export const validateRefreshIn = compileComponentSchema("RefreshIn");
export const validateTokenPair = compileComponentSchema("TokenPair");
export const validateUser = compileComponentSchema("User");
export const validateUserPatch = compileComponentSchema("UserPatch");
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

export type CanonicalTopicWire = components["schemas"]["CanonicalTopic"];
export type TopicTagWire = components["schemas"]["TopicTag"];
export type TopicPageWire = components["schemas"]["TopicPage"];
export type TopicDatePageWire = components["schemas"]["TopicDatePage"];
export type TagPageWire = components["schemas"]["TagPage"];
export const validateCanonicalTopic = compileComponentSchema("CanonicalTopic");
export const validateTopicTag = compileComponentSchema("TopicTag");
export const validateTopicPage = compileComponentSchema("TopicPage");
export const validateTopicDatePage = compileComponentSchema("TopicDatePage");
export const validateTagPage = compileComponentSchema("TagPage");
export const validateTopicCreate = compileComponentSchema("TopicCreate");
export const validateTopicPatch = compileComponentSchema("TopicPatch");
export const validateTagReplace = compileComponentSchema("TagReplace");

// M11: imported MD1-MD5 schemas remain authoritative. In particular MD2
// accepts dimensions, never client-supplied audio duration or object metadata.
export type UploadIntentCreateWire =
  components["schemas"]["UploadIntentCreate"];
export type UploadIntentWithPresignedPutWire =
  components["schemas"]["UploadIntentWithPresignedPut"];
export type UploadFinalizeWire = components["schemas"]["UploadFinalize"];
export type UploadFinalizeResultWire =
  components["schemas"]["UploadFinalizeResult"];
export type ConfirmedUploadWire = components["schemas"]["ConfirmedUpload"];
export type ChatroomMediaItemWire = components["schemas"]["ChatroomMediaItem"];
export type ChatroomMediaPageWire = components["schemas"]["ChatroomMediaPage"];
export type MediaAccessUrlWire = components["schemas"]["MediaAccessUrl"];
export const validateUploadIntentCreate =
  compileComponentSchema("UploadIntentCreate");
export const validateUploadIntentWithPresignedPut = compileComponentSchema(
  "UploadIntentWithPresignedPut",
);
export const validateUploadFinalize = compileComponentSchema("UploadFinalize");
export const validateUploadFinalizeResult = compileComponentSchema(
  "UploadFinalizeResult",
);
// S3 removed MD3 (GET /api/v1/topics/{topic_id}/media) and the
// TopicMedia/TopicMediaPage schemas; C5 (GET /api/v1/chatrooms/{chatroom_id}/media,
// D4/E10) is the sole media-listing operation now, scoped to a chatroom's
// message timeline instead of a topic.
export const validateChatroomMediaItem =
  compileComponentSchema("ChatroomMediaItem");
export const validateChatroomMediaPage =
  compileComponentSchema("ChatroomMediaPage");
export const validateMediaAccessUrl = compileComponentSchema("MediaAccessUrl");

// S1 (GET /api/v1/conversations/{conversation_id}/events) and R1
// (POST /api/v1/realtime/tickets) wire shapes. 426/401/403/503 for both
// operations reuse the existing ErrorEnvelope validated above.
export type EventPageWire = components["schemas"]["EventPage"];
export type DeltaItemWire = components["schemas"]["DeltaItem"];
export type UnsupportedEventMarkerWire =
  components["schemas"]["UnsupportedEventMarker"];
export type ReconcileScopeWire = components["schemas"]["ReconcileScope"];
export type MessageCreatedEventWire =
  components["schemas"]["MessageCreatedEvent"];
export type TopicCreatedEventWire = components["schemas"]["TopicCreatedEvent"];
// M15/task-14 phase 1: S1 v2 adds two typed DeltaItem variants for content
// deletion (server C6/T8). Both are closed-schema (additionalProperties:
// false) like every other event above; S1 v1 keeps returning
// UnsupportedEventMarker(scope chat_history/group_topics) for these same
// logical events instead (E1).
export type MessageDeletedEventWire =
  components["schemas"]["MessageDeletedEvent"];
export type TopicDeletedEventWire = components["schemas"]["TopicDeletedEvent"];
export type RealtimeTicketWire = components["schemas"]["RealtimeTicket"];

export const validateEventPage = compileComponentSchema("EventPage");
export const validateDeltaItem = compileComponentSchema("DeltaItem");
export const validateUnsupportedEventMarker = compileComponentSchema(
  "UnsupportedEventMarker",
);
export const validateMessageCreatedEvent = compileComponentSchema(
  "MessageCreatedEvent",
);
export const validateTopicCreatedEvent =
  compileComponentSchema("TopicCreatedEvent");
export const validateMessageDeletedEvent = compileComponentSchema(
  "MessageDeletedEvent",
);
export const validateTopicDeletedEvent =
  compileComponentSchema("TopicDeletedEvent");
export const validateRealtimeTicket = compileComponentSchema("RealtimeTicket");

// Realtime WebSocket wire boundary, validated against the selectively
// vendored contracts/server/realtime/*.json artifacts (a separate Ajv
// instance avoids $id collisions with the openapi.json component schemas
// above). additionalProperties is intentionally absent from the client/server
// control-frame branches below because the authoritative schema omits it
// there; only the event envelopes (message.created/topic.created and their
// nested data) declare additionalProperties:false. This mirrors the
// upstream schema exactly rather than over-restricting legal fields.
const realtimeAjv = new Ajv2020({ allErrors: true, strict: false });
registerServerContractFormats(realtimeAjv);

function compileRealtimeFrameSchema<T>(
  schema: unknown,
): (value: unknown) => value is T {
  const validate = realtimeAjv.compile<T>(schema as never);
  return (value: unknown): value is T => validate(value);
}

export type RealtimeClientFrame =
  | Readonly<{
      type: "subscribe";
      request_id: string;
      conversation_id: string;
    }>
  | Readonly<{
      type: "unsubscribe";
      request_id: string;
      conversation_id: string;
    }>
  | Readonly<{ type: "ping"; nonce: string }>;

export type RealtimeServerControlFrame =
  | Readonly<{
      type: "subscribed";
      request_id: string;
      conversation_id: string;
    }>
  | Readonly<{
      type: "unsubscribed";
      request_id: string;
      conversation_id: string;
    }>
  | Readonly<{ type: "pong"; nonce: string }>
  | Readonly<{
      type: "error";
      request_id: string;
      code: string;
      message: string;
    }>;

// M15/task-14 phase 1: the WS server-frame union grows the same two typed
// delete events S1 v2 gained (see server-frame.schema.json's oneOf, refreshed
// by the next intake). R1 tickets bind the negotiated contract version, so a
// v1 session's server never emits these two frame types over the socket.
export type RealtimeServerFrame =
  | RealtimeServerControlFrame
  | MessageCreatedEventWire
  | TopicCreatedEventWire
  | MessageDeletedEventWire
  | TopicDeletedEventWire;

export const validateRealtimeClientFrame =
  compileRealtimeFrameSchema<RealtimeClientFrame>(realtimeClientFrameSchema);
export const validateRealtimeServerFrame =
  compileRealtimeFrameSchema<RealtimeServerFrame>(realtimeServerFrameSchema);
export const validateRealtimeMessageCreatedFrame =
  compileRealtimeFrameSchema<MessageCreatedEventWire>(
    realtimeMessageCreatedFrameSchema,
  );
export const validateRealtimeTopicCreatedFrame =
  compileRealtimeFrameSchema<TopicCreatedEventWire>(
    realtimeTopicCreatedFrameSchema,
  );
export const validateRealtimeMessageDeletedFrame =
  compileRealtimeFrameSchema<MessageDeletedEventWire>(
    realtimeMessageDeletedFrameSchema,
  );
export const validateRealtimeTopicDeletedFrame =
  compileRealtimeFrameSchema<TopicDeletedEventWire>(
    realtimeTopicDeletedFrameSchema,
  );

// M15/task-14 phase 1 public API (task-app-chat/task-app-topics consume this
// directly): MessageDeletedEvent/TopicDeletedEvent are the app-facing names
// for the two new S1 typed delete events -- no separate domain remap exists
// because every field is already a plain identifier or RFC3339 timestamp
// string consumed as-is.
export type MessageDeletedEvent = MessageDeletedEventWire;
export type TopicDeletedEvent = TopicDeletedEventWire;

/**
 * S1 (GET /api/v1/conversations/{conversation_id}/events) discriminates each
 * closed-union DeltaItem by its `type` field, never by structural shape
 * ("data" in item -- E17), because message.deleted/topic.deleted also carry
 * a `data` object like message.created. UnsupportedEventMarker is the only
 * DeltaItem member with no `type` field at all, so its absence is itself the
 * discriminant for "unknown/unsupported" (an actually-unrecognized future
 * `type` value is rejected upstream by validateDeltaItem/validateEventPage
 * before this ever runs, since the closed oneOf has no catch-all branch).
 */
export type ClassifiedDeltaItem =
  | Readonly<{ kind: "message.created"; event: MessageCreatedEventWire }>
  | Readonly<{ kind: "message.deleted"; event: MessageDeletedEvent }>
  | Readonly<{ kind: "topic.deleted"; event: TopicDeletedEvent }>
  | Readonly<{ kind: "unsupported"; event: UnsupportedEventMarkerWire }>;

export function classifyDeltaItem(item: DeltaItemWire): ClassifiedDeltaItem {
  if (!("type" in item)) return { event: item, kind: "unsupported" };
  if (item.type === "message.created")
    return { event: item, kind: "message.created" };
  if (item.type === "message.deleted")
    return { event: item, kind: "message.deleted" };
  return { event: item, kind: "topic.deleted" };
}

// protocol.json is lifecycle/versioning metadata (heartbeat timing, close
// codes, ticket policy), not a JSON Schema; its type is inferred directly
// from the vendored document so it can never drift from or invent beyond
// the authoritative snapshot.
export type RealtimeProtocol = typeof realtimeProtocolDocument;
export const realtimeProtocol: RealtimeProtocol = realtimeProtocolDocument;

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

// M12 (N1/N2): notification inbox page + item wire shapes. args is a
// server D9-defined single-key record (author_display_name for new_topic,
// sender_display_name for chat_unread); unrecognized keys/types are the
// consumer's (notification-copy.ts) responsibility to render safely, never
// this validator's. M14 round 2 S1 adds optional group_name/topic_title
// context keys alongside the type-keyed field; see notifications.ts's
// NotificationArgs doc comment and readNotificationContextString.
export type NotificationArgsWire = components["schemas"]["NotificationArgs"];
export type NotificationWire = components["schemas"]["Notification"];
export type NotificationPageWire = components["schemas"]["NotificationPage"];
export const validateNotification = compileComponentSchema("Notification");
export const validateNotificationPage =
  compileComponentSchema("NotificationPage");

// M12 (P2/P3/P4): Expo push installation lifecycle wire shapes.
export type ExpoInstallationCreateWire =
  components["schemas"]["ExpoInstallationCreate"];
export type ExpoInstallationPutWire =
  components["schemas"]["ExpoInstallationPut"];
export type PushInstallationWire = components["schemas"]["PushInstallation"];
export const validateExpoInstallationCreate = compileComponentSchema(
  "ExpoInstallationCreate",
);
export const validateExpoInstallationPut = compileComponentSchema(
  "ExpoInstallationPut",
);
export const validatePushInstallation =
  compileComponentSchema("PushInstallation");

// Push `data` payload delivered into expo-notifications' response content on
// tap (consumed by push-tap-handoff.ts, a later M12 task); validated here
// alongside the other M12 wire shapes so every task shares one compiled ajv
// instance.
export type PushTapHandoffWire = components["schemas"]["PushTapHandoff"];
export const validatePushTapHandoff = compileComponentSchema("PushTapHandoff");
