import type { OAuthProvider, TokenPair, UserProfile } from "../../auth/types";

import type {
  CanonicalMessageWire,
  ChatroomPageWire,
  ChatroomWire,
  DenormalizedMessagePageWire,
  DenormalizedMessageWire,
  DependencyStatusWire,
  GroupPageWire,
  GroupWire,
  InviteJoinResultWire,
  InviteWire,
  LivenessResponseWire,
  MemberPageWire,
  MemberWire,
  MessageAttachmentWire,
  OAuthAuthorizeOutWire,
  ReadinessResponseWire,
  ReadMarkerWire,
  TokenPairWire,
  UserWire,
} from "./validators";

export type HealthLiveness = Readonly<{ status: "live" }>;

export type DependencyHealth = Readonly<{
  status: DependencyStatusWire;
  required: boolean;
}>;

export type HealthReadiness = Readonly<{
  status: "ready" | "not_ready";
  dependencies: Readonly<{
    postgres: DependencyHealth;
    redis: DependencyHealth;
    minio: DependencyHealth;
  }>;
}>;

export type OAuthAuthorization = Readonly<{
  authorizationUrl: string;
  state: string;
  expiresInSeconds: number;
}>;

export function mapLiveness(wire: LivenessResponseWire): HealthLiveness {
  return { status: wire.status };
}

export function mapReadiness(wire: ReadinessResponseWire): HealthReadiness {
  return {
    dependencies: {
      minio: {
        required: wire.checks.minio.required,
        status: wire.checks.minio.status,
      },
      postgres: {
        required: wire.checks.postgres.required,
        status: wire.checks.postgres.status,
      },
      redis: {
        required: wire.checks.redis.required,
        status: wire.checks.redis.status,
      },
    },
    status: wire.status,
  };
}

export function mapOAuthAuthorization(
  wire: OAuthAuthorizeOutWire,
): OAuthAuthorization {
  return {
    authorizationUrl: wire.authorization_url,
    expiresInSeconds: wire.expires_in_seconds,
    state: wire.state,
  };
}

export function mapTokenPair(wire: TokenPairWire): TokenPair {
  return {
    accessToken: wire.access_token,
    accessTokenExpiresAt: wire.access_token_expires_at,
    refreshToken: wire.refresh_token,
    refreshTokenExpiresAt: wire.refresh_token_expires_at,
  };
}

export function mapUserProfile(wire: UserWire): UserProfile {
  return {
    avatarUrl: wire.avatar_url,
    createdAt: wire.created_at,
    id: wire.id,
    nickname: wire.nickname,
    provider: wire.provider,
  };
}

export function isKnownOAuthProvider(value: string): value is OAuthProvider {
  return value === "kakao" || value === "google";
}

export type Group = Readonly<{
  id: string;
  name: string;
  ownerId: string;
  maxMembers: number;
  memberCount: number;
  createdAt: string;
  mainChatroomId: string;
}>;

export type GroupPage = Readonly<{
  items: readonly Group[];
  nextCursor: string | null;
}>;

export type Member = Readonly<{
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: "owner" | "member";
  joinedAt: string;
}>;

export type MemberPage = Readonly<{
  items: readonly Member[];
  nextCursor: string | null;
}>;

export type Invite = Readonly<{
  id: string;
  groupId: string;
  code: string;
  createdBy: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
}>;

export type InviteJoinResult = Readonly<{
  groupId: string;
  membershipId: string | null;
  joined: boolean;
}>;

export function mapGroup(wire: GroupWire): Group {
  return {
    createdAt: wire.created_at,
    id: wire.id,
    mainChatroomId: wire.main_chatroom_id,
    maxMembers: wire.max_members,
    memberCount: wire.member_count,
    name: wire.name,
    ownerId: wire.owner_id,
  };
}

/** next_cursor is an opaque server token: pass it through unparsed, never compared or synthesized. */
export function mapGroupPage(wire: GroupPageWire): GroupPage {
  return {
    items: wire.items.map(mapGroup),
    nextCursor: wire.next_cursor,
  };
}

export function mapMember(wire: MemberWire): Member {
  return {
    avatarUrl: wire.avatar_url,
    joinedAt: wire.joined_at,
    nickname: wire.nickname,
    role: wire.role,
    userId: wire.user_id,
  };
}

/** G4's next_cursor is an opaque membership cursor, never Member.user_id: pass it through unparsed. */
export function mapMemberPage(wire: MemberPageWire): MemberPage {
  return {
    items: wire.items.map(mapMember),
    nextCursor: wire.next_cursor,
  };
}

export function mapInvite(wire: InviteWire): Invite {
  return {
    code: wire.code,
    createdAt: wire.created_at,
    createdBy: wire.created_by,
    expiresAt: wire.expires_at,
    groupId: wire.group_id,
    id: wire.id,
    maxUses: wire.max_uses,
    usedCount: wire.used_count,
  };
}

export function mapInviteJoinResult(
  wire: InviteJoinResultWire,
): InviteJoinResult {
  return {
    groupId: wire.group_id,
    joined: wire.joined,
    membershipId: wire.membership_id,
  };
}

export type MessageAttachment = Readonly<{
  id: string;
  mediaUploadId: string;
  type: MessageAttachmentWire["type"];
  byteSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  filename: string | null;
  position: number;
  posterMediaId: string | null;
}>;

export type Chatroom = Readonly<{
  id: string;
  groupId: string;
  type: ChatroomWire["type"];
  topicId: string | null;
  createdAt: string;
}>;

export type ChatroomPage = Readonly<{
  items: readonly Chatroom[];
  nextCursor: string | null;
}>;

/** C2 history item: sender nickname/avatar are hydrated here but not on C4's canonical response. */
export type ChatMessage = Readonly<{
  id: string;
  chatroomId: string;
  senderId: string | null;
  senderNickname: string | null;
  senderAvatarUrl: string | null;
  clientMessageId: string | null;
  body: string | null;
  type: DenormalizedMessageWire["type"];
  createdAt: string;
  media: readonly MessageAttachment[];
}>;

export type ChatMessagePage = Readonly<{
  items: readonly ChatMessage[];
  nextCursor: string | null;
}>;

/** C4 send response: now carries optional-nullable sender nickname/avatar (realtime/delta payloads bind them too). */
export type CanonicalChatMessage = Readonly<{
  id: string;
  chatroomId: string;
  senderId: string | null;
  senderNickname: string | null;
  senderAvatarUrl: string | null;
  clientMessageId: string | null;
  body: string | null;
  type: CanonicalMessageWire["type"];
  createdAt: string;
  media: readonly MessageAttachment[];
}>;

export type ChatReadMarker = Readonly<{
  chatroomId: string;
  lastReadCursor: string;
  updatedAt: string;
}>;

function mapMessageAttachment(wire: MessageAttachmentWire): MessageAttachment {
  return {
    byteSize: wire.byte_size,
    duration: wire.duration,
    filename: wire.filename,
    height: wire.height,
    id: wire.id,
    mediaUploadId: wire.media_upload_id,
    position: wire.position,
    posterMediaId: wire.poster_media_id,
    type: wire.type,
    width: wire.width,
  };
}

export function mapChatroom(wire: ChatroomWire): Chatroom {
  return {
    createdAt: wire.created_at,
    groupId: wire.group_id,
    id: wire.id,
    topicId: wire.topic_id,
    type: wire.type,
  };
}

/** C1's next_cursor is an opaque, group-scoped forward cursor: pass it through unparsed. */
export function mapChatroomPage(wire: ChatroomPageWire): ChatroomPage {
  return {
    items: wire.items.map(mapChatroom),
    nextCursor: wire.next_cursor,
  };
}

/** created_at is preserved verbatim, including sub-millisecond precision; never routed through Date. */
export function mapChatMessage(wire: DenormalizedMessageWire): ChatMessage {
  return {
    body: wire.body,
    chatroomId: wire.chatroom_id,
    clientMessageId: wire.client_msg_id,
    createdAt: wire.created_at,
    id: wire.id,
    media: wire.media.map(mapMessageAttachment),
    senderAvatarUrl: wire.sender_avatar_url,
    senderId: wire.sender_id,
    senderNickname: wire.sender_nickname,
    type: wire.type,
  };
}

/** C2's next_cursor is the oldest selected message id when older history exists: pass it through unparsed. */
export function mapChatMessagePage(
  wire: DenormalizedMessagePageWire,
): ChatMessagePage {
  return {
    items: wire.items.map(mapChatMessage),
    nextCursor: wire.next_cursor,
  };
}

/** sender_id/sender_nickname/sender_avatar_url/client_msg_id/body may be entirely absent on the wire (system messages, legacy payloads); represented as null, never fabricated. */
export function mapCanonicalChatMessage(
  wire: CanonicalMessageWire,
): CanonicalChatMessage {
  return {
    body: wire.body ?? null,
    chatroomId: wire.chatroom_id,
    clientMessageId: wire.client_msg_id ?? null,
    createdAt: wire.created_at,
    id: wire.id,
    media: wire.media.map(mapMessageAttachment),
    senderAvatarUrl: wire.sender_avatar_url ?? null,
    senderId: wire.sender_id ?? null,
    senderNickname: wire.sender_nickname ?? null,
    type: wire.type,
  };
}

export function mapChatReadMarker(wire: ReadMarkerWire): ChatReadMarker {
  return {
    chatroomId: wire.chatroom_id,
    lastReadCursor: wire.last_read_cursor,
    updatedAt: wire.updated_at,
  };
}
