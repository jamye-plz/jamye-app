import type { OAuthProvider, TokenPair, UserProfile } from "../../auth/types";

import type {
  DependencyStatusWire,
  GroupPageWire,
  GroupWire,
  InviteJoinResultWire,
  InviteWire,
  LivenessResponseWire,
  MemberPageWire,
  MemberWire,
  OAuthAuthorizeOutWire,
  ReadinessResponseWire,
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
