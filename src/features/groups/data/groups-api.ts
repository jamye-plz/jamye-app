import { parsePublicApiOrigin } from "@/core/config/public-env";
import {
  isValidInviteJoinCode,
  mapGroup,
  mapGroupPage,
  mapInvite,
  mapInviteJoinResult,
  mapMemberPage,
  validateErrorEnvelope,
  validateGroup,
  validateGroupCreate,
  validateGroupPage,
  validateGroupPatch,
  validateInvite,
  validateInviteJoinResult,
  validateMemberPage,
  validateMemberRolePatch,
} from "@/core/contracts/server";
import type {
  Group,
  GroupPage,
  Invite,
  InviteJoinResult,
  MemberPage,
} from "@/core/contracts/server";
import {
  HttpAbortedError,
  REQUEST_TIMEOUT_MS,
  parseJsonResponseBody,
  withTimeoutSignal,
} from "@/core/http/http-client";
import { isGroupIdentifier, isInviteInput } from "../model/groups-input";

export class GroupsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}

export type GroupsPage = Readonly<{ limit?: number; after?: string }>;

export type GroupsApi = Readonly<{
  createGroup: (
    accessToken: string,
    input: Readonly<{ name: string }>,
    signal?: AbortSignal,
  ) => Promise<Group>;
  listGroups: (
    accessToken: string,
    params: GroupsPage,
    signal?: AbortSignal,
  ) => Promise<GroupPage>;
  getGroup: (
    accessToken: string,
    groupId: string,
    signal?: AbortSignal,
  ) => Promise<Group>;
  listMembers: (
    accessToken: string,
    groupId: string,
    params: GroupsPage,
    signal?: AbortSignal,
  ) => Promise<MemberPage>;
  renameGroup: (
    accessToken: string,
    groupId: string,
    input: Readonly<{ name: string }>,
    signal?: AbortSignal,
  ) => Promise<Group>;
  deleteGroup: (
    accessToken: string,
    groupId: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  removeMember: (
    accessToken: string,
    groupId: string,
    userId: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  setMemberRole: (
    accessToken: string,
    groupId: string,
    userId: string,
    input: Readonly<{ role: "owner" }>,
    signal?: AbortSignal,
  ) => Promise<void>;
  createInvite: (
    accessToken: string,
    groupId: string,
    input: Readonly<{ expiresAt?: string | null; maxUses?: number | null }>,
    signal?: AbortSignal,
  ) => Promise<Invite>;
  joinByInvite: (
    accessToken: string,
    code: string,
    signal?: AbortSignal,
  ) => Promise<InviteJoinResult>;
}>;

function validatePageParams(params: GroupsPage): void {
  if (
    params.limit !== undefined &&
    (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100)
  ) {
    throw new GroupsApiError(422, "invalid_page_limit");
  }
}

function buildPageQuery(params: GroupsPage): string {
  const query = new URLSearchParams();
  if (params.after !== undefined) query.set("after", params.after);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function parseRetryAfterSeconds(header: string | null): number | null {
  if (header === null || !/^[0-9]+$/.test(header)) return null;
  const seconds = Number(header);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function identifier(value: string): string {
  if (!isGroupIdentifier(value))
    throw new GroupsApiError(422, "invalid_identifier");
  return encodeURIComponent(value);
}

export function createGroupsApi(origin: string): GroupsApi {
  const apiOrigin = parsePublicApiOrigin(origin);

  async function request(
    path: string,
    accessToken: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
    expectedStatus: number,
  ): Promise<unknown> {
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
        throw new GroupsApiError(
          status,
          code,
          status === 429 ? retryAfterSeconds : null,
        );
      }
      if (status !== expectedStatus)
        throw new GroupsApiError(502, "invalid_response_status");
      return payload;
    } catch (error) {
      if (error instanceof GroupsApiError) throw error;
      if (error instanceof HttpAbortedError)
        throw error.by === "caller"
          ? new GroupsApiError(0, "request_cancelled")
          : new GroupsApiError(408, "request_timeout");
      throw new GroupsApiError(0, "network_unavailable");
    }
  }

  return {
    async createGroup(accessToken, input, signal) {
      const body = { name: input.name };
      if (!validateGroupCreate(body))
        throw new GroupsApiError(422, "invalid_group_name");
      const value = await request(
        "/api/v1/groups",
        accessToken,
        { method: "POST", body: JSON.stringify(body) },
        signal,
        201,
      );
      if (!validateGroup(value))
        throw new GroupsApiError(502, "invalid_group_response");
      return mapGroup(value);
    },
    async listGroups(accessToken, params, signal) {
      validatePageParams(params);
      const value = await request(
        `/api/v1/groups${buildPageQuery(params)}`,
        accessToken,
        {},
        signal,
        200,
      );
      if (!validateGroupPage(value))
        throw new GroupsApiError(502, "invalid_group_page_response");
      return mapGroupPage(value);
    },
    async getGroup(accessToken, groupId, signal) {
      const value = await request(
        `/api/v1/groups/${identifier(groupId)}`,
        accessToken,
        {},
        signal,
        200,
      );
      if (!validateGroup(value))
        throw new GroupsApiError(502, "invalid_group_response");
      return mapGroup(value);
    },
    async listMembers(accessToken, groupId, params, signal) {
      validatePageParams(params);
      const value = await request(
        `/api/v1/groups/${identifier(groupId)}/members${buildPageQuery(params)}`,
        accessToken,
        {},
        signal,
        200,
      );
      if (!validateMemberPage(value))
        throw new GroupsApiError(502, "invalid_member_page_response");
      return mapMemberPage(value);
    },
    async renameGroup(accessToken, groupId, input, signal) {
      const body = { name: input.name };
      if (!validateGroupPatch(body))
        throw new GroupsApiError(422, "invalid_group_name");
      const value = await request(
        `/api/v1/groups/${identifier(groupId)}`,
        accessToken,
        { method: "PATCH", body: JSON.stringify(body) },
        signal,
        200,
      );
      if (!validateGroup(value))
        throw new GroupsApiError(502, "invalid_group_response");
      return mapGroup(value);
    },
    async deleteGroup(accessToken, groupId, signal) {
      await request(
        `/api/v1/groups/${identifier(groupId)}`,
        accessToken,
        { method: "DELETE" },
        signal,
        204,
      );
    },
    async removeMember(accessToken, groupId, userId, signal) {
      await request(
        `/api/v1/groups/${identifier(groupId)}/members/${identifier(userId)}`,
        accessToken,
        { method: "DELETE" },
        signal,
        204,
      );
    },
    async setMemberRole(accessToken, groupId, userId, input, signal) {
      const body = { role: input.role };
      if (body.role !== "owner" || !validateMemberRolePatch(body))
        throw new GroupsApiError(422, "invalid_member_role");
      await request(
        `/api/v1/groups/${identifier(groupId)}/members/${identifier(userId)}`,
        accessToken,
        { method: "PATCH", body: JSON.stringify(body) },
        signal,
        204,
      );
    },
    async createInvite(accessToken, groupId, input, signal) {
      const body = {
        expires_at: input.expiresAt ?? null,
        max_uses: input.maxUses ?? null,
      };
      if (!isInviteInput(input))
        throw new GroupsApiError(422, "invalid_invite_create");
      const value = await request(
        `/api/v1/groups/${identifier(groupId)}/invites`,
        accessToken,
        { method: "POST", body: JSON.stringify(body) },
        signal,
        201,
      );
      if (!validateInvite(value))
        throw new GroupsApiError(502, "invalid_invite_response");
      return mapInvite(value);
    },
    async joinByInvite(accessToken, code, signal) {
      if (!isValidInviteJoinCode(code))
        throw new GroupsApiError(422, "invalid_invite_code");
      const value = await request(
        `/api/v1/invites/${encodeURIComponent(code)}/join`,
        accessToken,
        { method: "POST" },
        signal,
        200,
      );
      if (!validateInviteJoinResult(value))
        throw new GroupsApiError(502, "invalid_invite_join_response");
      return mapInviteJoinResult(value);
    },
  };
}
