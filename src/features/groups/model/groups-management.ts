import type { Group, Invite } from "@/core/contracts/server";
import type { GroupsApi } from "../data/groups-api";
import {
  invalidationEffectForError,
  isUncertainMutationOutcome,
  mapGroupsApiError,
  retryAfterDeadline,
} from "./groups-error";
import type { GroupsErrorOutcome } from "./groups-error";
import { isGroupIdentifier, isGroupName, isInviteInput } from "./groups-input";
import type { InviteInput } from "./groups-input";
import type { GroupsState } from "./groups-state";

export type GroupsManagementActions = Readonly<{
  renameGroup: (name: string) => Promise<boolean>;
  deleteGroup: () => Promise<boolean>;
  removeMember: (userId: string) => Promise<boolean>;
  transferOwnership: (userId: string) => Promise<boolean>;
  createInvite: (
    input: InviteInput,
    confirmedRepeat?: boolean,
  ) => Promise<boolean>;
  clearInvite: () => void;
}>;
type Ticket = Readonly<{
  current: () => boolean;
  run: <T>(
    execute: (
      service: GroupsApi,
      token: string,
      signal: AbortSignal,
    ) => Promise<T>,
  ) => Promise<T>;
}>;
type Operation = "rename" | "delete" | "remove" | "transfer" | "invite";
type Context = Readonly<{
  getState: () => GroupsState;
  publish: (state: GroupsState) => void;
  currentUserId: () => string | null;
  begin: () => Ticket | null;
  cancel: () => void;
  reloadList: () => Promise<void>;
  reloadGroup: (id: string) => Promise<void>;
  evict: (id: string, error: GroupsErrorOutcome) => void;
}>;

export function createGroupsManagement(context: Context) {
  const uncertainInvites = new Set<string>();
  let pending: { operation: Operation; groupId: string } | null = null;
  function fail(error: GroupsErrorOutcome): false {
    context.publish({
      ...context.getState(),
      management: { status: "failed", error },
    });
    return false;
  }
  async function execute(
    operation: Operation,
    effect: (ticket: Ticket, group: Group) => Promise<void | Invite>,
    options: Readonly<{
      memberId?: string;
      valid?: boolean;
      repeat?: boolean;
    }> = {},
  ): Promise<boolean> {
    const state = context.getState();
    const group = state.detail.group;
    const actor = context.currentUserId();
    if (
      !actor ||
      !group ||
      state.detail.status !== "ready" ||
      pending ||
      state.retryAt.management > Date.now()
    )
      return false;
    if (options.valid === false)
      return fail({ kind: "validation", code: "invalid_input" });
    const selfLeave = operation === "remove" && options.memberId === actor;
    if (selfLeave && group.ownerId === actor)
      return fail({ kind: "conflict", code: "group_owner_conflict" });
    if (!selfLeave && group.ownerId !== actor)
      return fail({ kind: "owner_required" });
    if (operation === "transfer" && options.memberId === actor)
      return fail({ kind: "conflict", code: "group_owner_conflict" });
    if (
      operation === "invite" &&
      uncertainInvites.has(group.id) &&
      !options.repeat
    ) {
      context.publish({ ...state, inviteUncertain: true });
      return false;
    }
    const ticket = context.begin();
    if (!ticket) return false;
    const attempt = { operation, groupId: group.id };
    pending = attempt;
    context.publish({
      ...state,
      management: { status: "pending" },
      invite: null,
    });
    try {
      const result = await effect(ticket, group);
      if (!ticket.current()) return false;
      if (operation === "invite") {
        uncertainInvites.delete(group.id);
        context.publish({
          ...context.getState(),
          invite: result as Invite,
          inviteUncertain: false,
        });
      } else {
        if (operation === "delete" || selfLeave)
          context.evict(group.id, { kind: "membership_required" });
        await context.reloadList();
        if (!ticket.current()) return false;
        if (operation !== "delete" && !selfLeave)
          await context.reloadGroup(group.id);
      }
      if (!ticket.current()) return false;
      context.publish({
        ...context.getState(),
        management: { status: "succeeded", result: undefined },
      });
      return true;
    } catch (error) {
      if (!ticket.current()) return false;
      const outcome = mapGroupsApiError(error);
      const uncertain = isUncertainMutationOutcome(outcome);
      if (operation === "invite" && uncertain) uncertainInvites.add(group.id);
      const invalidation = invalidationEffectForError(outcome);
      if (invalidation.kind === "remove_group")
        context.evict(group.id, outcome);
      else if (
        invalidation.kind === "refetch_permissions" ||
        uncertain ||
        outcome.kind === "conflict" ||
        (outcome.kind === "not_found" && outcome.code === "member_not_found")
      )
        await context.reloadGroup(group.id);
      if (!ticket.current()) return false;
      context.publish({
        ...context.getState(),
        invite: null,
        retryAt: {
          ...context.getState().retryAt,
          management: retryAfterDeadline(outcome),
        },
        inviteUncertain: uncertainInvites.has(group.id),
        management: {
          status: uncertain ? "uncertain" : "failed",
          error: outcome,
        },
      });
      return false;
    } finally {
      if (pending === attempt) pending = null;
    }
  }
  function interrupt(): void {
    if (pending?.operation === "invite") uncertainInvites.add(pending.groupId);
    context.cancel();
    const state = context.getState();
    context.publish({
      ...state,
      invite: null,
      inviteUncertain:
        state.detail.id !== null && uncertainInvites.has(state.detail.id),
      management: pending
        ? { status: "uncertain", error: { kind: "network" } }
        : state.management,
    });
    pending = null;
  }
  const actions: GroupsManagementActions = {
    renameGroup: (name) =>
      execute(
        "rename",
        async (ticket, group) => {
          await ticket.run((service, token, signal) =>
            service.renameGroup(token, group.id, { name }, signal),
          );
        },
        { valid: isGroupName(name) },
      ),
    deleteGroup: () =>
      execute("delete", (ticket, group) =>
        ticket.run((service, token, signal) =>
          service.deleteGroup(token, group.id, signal),
        ),
      ),
    removeMember: (userId) =>
      execute(
        "remove",
        (ticket, group) =>
          ticket.run((service, token, signal) =>
            service.removeMember(token, group.id, userId, signal),
          ),
        { memberId: userId, valid: isGroupIdentifier(userId) },
      ),
    transferOwnership: (userId) =>
      execute(
        "transfer",
        (ticket, group) =>
          ticket.run((service, token, signal) =>
            service.setMemberRole(
              token,
              group.id,
              userId,
              { role: "owner" },
              signal,
            ),
          ),
        { memberId: userId, valid: isGroupIdentifier(userId) },
      ),
    createInvite: (input, confirmedRepeat = false) =>
      execute(
        "invite",
        (ticket, group) =>
          ticket.run((service, token, signal) =>
            service.createInvite(token, group.id, input, signal),
          ),
        { valid: isInviteInput(input), repeat: confirmedRepeat },
      ),
    clearInvite: () => context.publish({ ...context.getState(), invite: null }),
  };
  return {
    actions,
    interrupt,
    reset() {
      pending = null;
      uncertainInvites.clear();
    },
    isInviteUncertain: (groupId: string) => uncertainInvites.has(groupId),
  };
}
