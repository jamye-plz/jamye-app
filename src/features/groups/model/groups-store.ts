import { AuthApiError } from "@/core/auth/auth-api";
import { parsePublicApiOrigin } from "@/core/config/public-env";
import { isValidInviteJoinCode } from "@/core/contracts/server";
import type { Group, InviteJoinResult } from "@/core/contracts/server";
import { GroupsApiError } from "../data/groups-api";
import type { GroupsApi } from "../data/groups-api";
import {
  invalidationEffectForError,
  isUncertainMutationOutcome,
  mapGroupsApiError,
  retryAfterDeadline,
} from "./groups-error";
import type { GroupsErrorOutcome } from "./groups-error";
import { isGroupIdentifier, isGroupName } from "./groups-input";
import {
  emptyDetail,
  emptyPage,
  initialGroupsState,
  mergePage,
} from "./groups-state";
import type { GroupsState } from "./groups-state";
import { createGroupsManagement } from "./groups-management";
import type { GroupsManagementActions } from "./groups-management";
export type { GroupsState, GroupMutationState } from "./groups-state";

export type GroupsPrincipal = Readonly<{
  origin: string;
  userId: string;
  epoch: number;
}>;
/** Only adapters/composition supply this callback; views consume store actions. */
export type AuthorizedGroupsRequest = <T>(
  execute: (token: string, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>;
export type GroupsStoreActions = GroupsManagementActions &
  Readonly<{
    loadGroups: () => Promise<void>;
    loadMoreGroups: () => Promise<void>;
    createGroup: (
      name: string,
      confirmedRepeat?: boolean,
    ) => Promise<Group | null>;
    resetCreateGroup: () => void;
    joinByInvite: (code: string) => Promise<InviteJoinResult | null>;
    resetJoinByInvite: () => void;
    openGroup: (groupId: string) => Promise<void>;
    loadMoreMembers: () => Promise<void>;
    closeGroup: () => void;
    background: () => void;
    foreground: () => Promise<void>;
  }>;
export type GroupsStore = Readonly<{
  getState: () => GroupsState;
  setPrincipal: (
    principal: GroupsPrincipal | null,
    authorize: AuthorizedGroupsRequest | null,
  ) => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
  actions: GroupsStoreActions;
}>;

export function createGroupsStore(
  deps: Readonly<{ createApi: (origin: string) => GroupsApi }>,
): GroupsStore {
  let identity = "";
  let userId: string | null = null;
  let api: GroupsApi | null = null;
  let authorize: AuthorizedGroupsRequest | null = null;
  let state = initialGroupsState();
  const listeners = new Set<() => void>();
  const requests = new Map<string, AbortController>();

  function publish(next: GroupsState): void {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function cancel(key: string): void {
    requests.get(key)?.abort();
    requests.delete(key);
  }
  function cancelAll(): void {
    for (const key of requests.keys()) cancel(key);
  }
  function begin(key: string) {
    if (!api || !authorize) return null;
    cancel(key);
    const controller = new AbortController();
    requests.set(key, controller);
    const executeAuthorized = authorize;
    const service = api;
    return {
      current: () =>
        requests.get(key) === controller && !controller.signal.aborted,
      async run<T>(
        execute: (
          api: GroupsApi,
          token: string,
          signal: AbortSignal,
        ) => Promise<T>,
      ): Promise<T> {
        try {
          return await executeAuthorized(
            (token, signal) => execute(service, token, signal),
            controller.signal,
          );
        } catch (error) {
          if (error instanceof AuthApiError)
            throw new GroupsApiError(error.status, error.code);
          throw error;
        }
      },
    };
  }
  function setPrincipal(
    next: GroupsPrincipal | null,
    executor: AuthorizedGroupsRequest | null,
  ): void {
    const origin = next ? parsePublicApiOrigin(next.origin) : "";
    const valid =
      next &&
      executor &&
      isGroupIdentifier(next.userId) &&
      Number.isSafeInteger(next.epoch);
    const key = valid ? JSON.stringify([origin, next.userId, next.epoch]) : "";
    authorize = valid ? executor : null;
    if (key === identity) return;
    cancelAll();
    management.reset();
    identity = key;
    userId = valid ? next.userId : null;
    api = valid ? deps.createApi(origin) : null;
    publish(initialGroupsState());
  }

  async function loadGroups(more = false): Promise<void> {
    const previous = state.list;
    if (
      more &&
      (previous.status !== "ready" ||
        previous.loadingMore ||
        previous.nextCursor === null)
    )
      return;
    const ticket = begin("list");
    if (!ticket) return;
    publish({
      ...state,
      list: {
        ...previous,
        status: more ? "ready" : "loading",
        loadingMore: more,
        error: null,
      },
    });
    try {
      const page = await ticket.run((service, token, signal) =>
        service.listGroups(
          token,
          more ? { after: previous.nextCursor! } : {},
          signal,
        ),
      );
      if (!ticket.current()) return;
      publish({
        ...state,
        list: {
          status: "ready",
          items: mergePage(
            more ? previous.items : [],
            page.items,
            (group) => group.id,
          ),
          nextCursor: page.nextCursor,
          loadingMore: false,
          error: null,
        },
      });
    } catch (error) {
      if (!ticket.current()) return;
      publish({
        ...state,
        list: {
          ...previous,
          status: previous.status === "ready" ? "ready" : "error",
          loadingMore: false,
          error: mapGroupsApiError(error),
        },
      });
    }
  }
  function evict(
    groupId: string,
    error: GroupsErrorOutcome,
    fromManagement = false,
  ): void {
    cancel("list");
    cancel("detail");
    cancel("members");
    if (!fromManagement) management.interrupt();
    publish({
      ...state,
      list: {
        ...state.list,
        items: state.list.items.filter((group) => group.id !== groupId),
        status: state.list.status === "loading" ? "ready" : state.list.status,
        loadingMore: false,
      },
      detail:
        state.detail.id === groupId
          ? {
              ...emptyDetail(),
              id: groupId,
              status: "error",
              accessLost: true,
              error,
            }
          : state.detail,
      invite: null,
    });
  }
  async function loadMembers(more = false): Promise<void> {
    const detail = state.detail;
    if (!detail.group || detail.accessLost) return;
    const previous = detail.members;
    if (
      more &&
      (previous.status !== "ready" ||
        previous.loadingMore ||
        previous.nextCursor === null)
    )
      return;
    const ticket = begin("members");
    if (!ticket) return;
    publish({
      ...state,
      detail: {
        ...detail,
        members: {
          ...previous,
          status: more ? "ready" : "loading",
          loadingMore: more,
          error: null,
        },
      },
    });
    try {
      const page = await ticket.run((service, token, signal) =>
        service.listMembers(
          token,
          detail.group!.id,
          more ? { after: previous.nextCursor! } : {},
          signal,
        ),
      );
      if (!ticket.current()) return;
      publish({
        ...state,
        detail: {
          ...state.detail,
          members: {
            status: "ready",
            items: mergePage(
              more ? previous.items : [],
              page.items,
              (member) => member.userId,
            ),
            nextCursor: page.nextCursor,
            loadingMore: false,
            error: null,
          },
        },
      });
    } catch (error) {
      if (!ticket.current()) return;
      const outcome = mapGroupsApiError(error);
      if (invalidationEffectForError(outcome).kind === "remove_group")
        evict(detail.group.id, outcome);
      else
        publish({
          ...state,
          detail: {
            ...state.detail,
            members: {
              ...previous,
              status: previous.status === "ready" ? "ready" : "error",
              loadingMore: false,
              error: outcome,
            },
          },
        });
    }
  }
  async function openGroup(groupId: string): Promise<void> {
    if (state.detail.id !== groupId) management.interrupt();
    cancel("members");
    const ticket = begin("detail");
    if (!ticket) return;
    const previous =
      state.detail.id === groupId && !state.detail.accessLost
        ? state.detail
        : emptyDetail();
    publish({
      ...state,
      invite: null,
      inviteUncertain: management.isInviteUncertain(groupId),
      detail: {
        ...previous,
        id: groupId,
        status: "loading",
        error: null,
        members: {
          ...previous.members,
          status:
            previous.members.status === "loading"
              ? "idle"
              : previous.members.status,
          loadingMore: false,
        },
      },
    });
    try {
      const group = await ticket.run((service, token, signal) =>
        service.getGroup(token, groupId, signal),
      );
      if (!ticket.current()) return;
      publish({
        ...state,
        detail: { ...state.detail, group, status: "ready" },
      });
      await loadMembers();
    } catch (error) {
      if (!ticket.current()) return;
      const outcome = mapGroupsApiError(error);
      if (invalidationEffectForError(outcome).kind === "remove_group")
        evict(groupId, outcome);
      else
        publish({
          ...state,
          detail: {
            ...state.detail,
            status: "error",
            error: outcome,
          },
        });
    }
  }
  async function createGroup(
    name: string,
    confirmedRepeat = false,
  ): Promise<Group | null> {
    if (
      state.retryAt.create > Date.now() ||
      state.createGroup.status === "pending" ||
      (state.createGroup.status === "uncertain" && !confirmedRepeat)
    )
      return null;
    if (!isGroupName(name)) {
      publish({
        ...state,
        createGroup: {
          status: "failed",
          error: { kind: "validation", code: "invalid_group_name" },
        },
      });
      return null;
    }
    const ticket = begin("create");
    if (!ticket) return null;
    publish({ ...state, createGroup: { status: "pending" } });
    try {
      const group = await ticket.run((service, token, signal) =>
        service.createGroup(token, { name }, signal),
      );
      if (!ticket.current()) return null;
      await loadGroups();
      if (!ticket.current()) return null;
      publish({
        ...state,
        createGroup: { status: "succeeded", result: group },
      });
      return group;
    } catch (error) {
      if (!ticket.current()) return null;
      const outcome = mapGroupsApiError(error);
      const uncertain = isUncertainMutationOutcome(outcome);
      if (uncertain) await loadGroups();
      if (!ticket.current()) return null;
      publish({
        ...state,
        retryAt: { ...state.retryAt, create: retryAfterDeadline(outcome) },
        createGroup: {
          status: uncertain ? "uncertain" : "failed",
          error: outcome,
        },
      });
      return null;
    }
  }
  async function joinByInvite(code: string): Promise<InviteJoinResult | null> {
    if (
      state.joinByInvite.status === "pending" ||
      state.retryAt.join > Date.now()
    )
      return null;
    if (!isValidInviteJoinCode(code)) {
      publish({
        ...state,
        joinByInvite: {
          status: "failed",
          error: { kind: "validation", code: "invalid_invite_code" },
        },
      });
      return null;
    }
    const ticket = begin("join");
    if (!ticket) return null;
    publish({ ...state, joinByInvite: { status: "pending" } });
    try {
      const result = await ticket.run((service, token, signal) =>
        service.joinByInvite(token, code, signal),
      );
      if (!ticket.current()) return null;
      await ticket.run((service, token, signal) =>
        service.getGroup(token, result.groupId, signal),
      );
      if (!ticket.current()) return null;
      await loadGroups();
      if (!ticket.current()) return null;
      publish({ ...state, joinByInvite: { status: "succeeded", result } });
      return result;
    } catch (error) {
      if (!ticket.current()) return null;
      const outcome = mapGroupsApiError(error);
      publish({
        ...state,
        retryAt: { ...state.retryAt, join: retryAfterDeadline(outcome) },
        joinByInvite: { status: "failed", error: outcome },
      });
      return null;
    }
  }
  function closeGroup(): void {
    management.interrupt();
    cancel("detail");
    cancel("members");
    publish({ ...state, detail: emptyDetail(), invite: null });
  }
  function background(): void {
    management.interrupt();
    cancelAll();
    publish({
      ...state,
      invite: null,
      list: {
        ...state.list,
        status: state.list.status === "loading" ? "ready" : state.list.status,
        loadingMore: false,
      },
      detail: { ...state.detail, group: null, members: emptyPage() },
      createGroup:
        state.createGroup.status === "pending"
          ? { status: "uncertain", error: { kind: "network" } }
          : state.createGroup,
      joinByInvite: { status: "idle" },
    });
  }
  async function foreground(): Promise<void> {
    await Promise.all([
      state.list.status !== "idle" ? loadGroups() : undefined,
      state.detail.id ? openGroup(state.detail.id) : undefined,
    ]);
  }
  const management = createGroupsManagement({
    getState: () => state,
    publish,
    currentUserId: () => userId,
    begin: () => begin("management"),
    cancel: () => cancel("management"),
    reloadList: () => loadGroups(),
    reloadGroup: openGroup,
    evict: (groupId, error) => evict(groupId, error, true),
  });
  return {
    getState: () => state,
    setPrincipal,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      setPrincipal(null, null);
      listeners.clear();
    },
    actions: {
      ...management.actions,
      loadGroups: () => loadGroups(),
      loadMoreGroups: () => loadGroups(true),
      createGroup,
      resetCreateGroup() {
        if (
          state.createGroup.status !== "pending" &&
          state.createGroup.status !== "uncertain"
        )
          publish({ ...state, createGroup: { status: "idle" } });
      },
      joinByInvite,
      resetJoinByInvite() {
        cancel("join");
        publish({ ...state, joinByInvite: { status: "idle" } });
      },
      openGroup,
      loadMoreMembers: () => loadMembers(true),
      closeGroup,
      background,
      foreground,
    },
  };
}
