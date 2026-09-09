import type {
  Group,
  Invite,
  InviteJoinResult,
  Member,
} from "@/core/contracts/server";
import type { GroupsErrorOutcome } from "./groups-error";

export type PageState<T> = Readonly<{
  status: "idle" | "loading" | "ready" | "error";
  items: readonly T[];
  nextCursor: string | null;
  loadingMore: boolean;
  error: GroupsErrorOutcome | null;
}>;
export type GroupMutationState<T> =
  | Readonly<{ status: "idle" | "pending" }>
  | Readonly<{ status: "succeeded"; result: T }>
  | Readonly<{ status: "failed" | "uncertain"; error: GroupsErrorOutcome }>;
export type GroupDetailState = Readonly<{
  id: string | null;
  status: "idle" | "loading" | "ready" | "error";
  group: Group | null;
  members: PageState<Member>;
  error: GroupsErrorOutcome | null;
  accessLost: boolean;
}>;
export type GroupsState = Readonly<{
  list: PageState<Group>;
  detail: GroupDetailState;
  createGroup: GroupMutationState<Group>;
  joinByInvite: GroupMutationState<InviteJoinResult>;
  management: GroupMutationState<void>;
  invite: Invite | null;
  inviteUncertain: boolean;
  retryAt: Readonly<{ create: number; join: number; management: number }>;
}>;

export function emptyPage<T>(): PageState<T> {
  return {
    status: "idle",
    items: [],
    nextCursor: null,
    loadingMore: false,
    error: null,
  };
}
export function emptyDetail(): GroupDetailState {
  return {
    id: null,
    status: "idle",
    group: null,
    members: emptyPage(),
    error: null,
    accessLost: false,
  };
}
export function initialGroupsState(): GroupsState {
  return {
    list: emptyPage(),
    detail: emptyDetail(),
    createGroup: { status: "idle" },
    joinByInvite: { status: "idle" },
    management: { status: "idle" },
    invite: null,
    inviteUncertain: false,
    retryAt: { create: 0, join: 0, management: 0 },
  };
}

export function mergePage<T>(
  previous: readonly T[],
  incoming: readonly T[],
  key: (item: T) => string,
): readonly T[] {
  const known = new Set(previous.map(key));
  return [
    ...previous,
    ...incoming.filter((item) => {
      if (known.has(key(item))) return false;
      known.add(key(item));
      return true;
    }),
  ];
}
