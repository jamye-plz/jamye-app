import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";
import { parsePublicApiOrigin } from "@/core/config/public-env";
import type { SessionPrincipal } from "@/core/providers/session-provider";
import { createGroupsApi as createDefaultGroupsApi } from "../data/groups-api";
import type { GroupsApi } from "../data/groups-api";
import type {
  AuthorizedGroupsRequest,
  GroupsStore,
  GroupsStoreActions,
  GroupsState,
} from "./groups-store";

type Value = Readonly<{
  state: GroupsState;
  actions: GroupsStoreActions;
  /**
   * Imperative escape hatch to the store's live state. `state` above is a
   * per-render snapshot, so a caller that awaits an action and then needs
   * the value the store just published in the same tick (e.g. G5 reading
   * the `Invite` a share flow just created) reads through here instead of
   * waiting for this provider's own next render.
   */
  getState: () => GroupsState;
  /**
   * E7b/C8: fetches the group by id and folds its name into a small
   * ensure-cache, without touching the store's own `detail`/`list` state --
   * `group-detail-screen.tsx`'s `openGroup`/`closeGroup` lifecycle owns
   * `detail`, so reusing it here would race a concurrently-open detail
   * screen. A no-op while a groupId is already cached or already in flight;
   * failures are silent (the caller keeps its own fallback and this simply
   * retries on the next miss, i.e. when a screen that needs the name mounts
   * again -- a plain re-render does not refetch).
   */
  ensureGroup: (groupId: string) => void;
  /** Names resolved by `ensureGroup`, keyed by groupId. */
  ensuredNames: Readonly<Record<string, string>>;
}>;
type Props = PropsWithChildren<
  Readonly<{
    origin: string;
    principal: SessionPrincipal | null;
    authorizedRequest: AuthorizedGroupsRequest;
    createStore: (origin: string) => GroupsStore;
    /** Test seam for `ensureGroup`'s own group-detail fetch; defaults to the
     * real N-layer API. Independent from `createStore`'s injected api since
     * `GroupsStore` does not expose its internal client. */
    createGroupsApi?: (origin: string) => GroupsApi;
  }>
>;
const Context = createContext<Value | undefined>(undefined);

export function GroupsProvider(props: Props) {
  const origin = parsePublicApiOrigin(props.origin);
  const { principal } = props;
  // Remount the entire protected tree before rendering any different identity.
  // A new object from the same auth session does not discard the group's data.
  const key = JSON.stringify([origin, principal?.userId, principal?.epoch]);
  return <ScopedGroupsProvider key={key} {...props} origin={origin} />;
}

function ScopedGroupsProvider({
  origin,
  principal,
  authorizedRequest,
  createStore,
  createGroupsApi = createDefaultGroupsApi,
  children,
}: Props) {
  const [store] = useState(() => {
    const value = createStore(origin);
    value.setPrincipal(principal, authorizedRequest);
    return value;
  });
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  useEffect(() => {
    store.setPrincipal(principal, authorizedRequest);
  }, [store, principal, authorizedRequest]);
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") store.actions.background();
      else if (previous !== "active") void store.actions.foreground();
      previous = next;
    });
    return () => {
      subscription.remove();
      store.dispose();
    };
  }, [store]);

  const groupsApi = useMemo(
    () => createGroupsApi(origin),
    [createGroupsApi, origin],
  );
  // `GroupsProvider` remounts this component per identity (its `key`), so
  // the ensure-cache and the in-flight set start empty for every account.
  const [ensuredNames, setEnsuredNames] = useState<Record<string, string>>({});
  const ensureInFlightRef = useRef(new Set<string>());
  const ensureGroup = useCallback(
    (groupId: string) => {
      if (ensuredNames[groupId] !== undefined) return;
      if (ensureInFlightRef.current.has(groupId)) return;
      ensureInFlightRef.current.add(groupId);
      void authorizedRequest((token, signal) =>
        groupsApi.getGroup(token, groupId, signal),
      )
        .then((group) => {
          setEnsuredNames((previous) => ({
            ...previous,
            [groupId]: group.name,
          }));
        })
        .catch(() => undefined)
        .finally(() => {
          ensureInFlightRef.current.delete(groupId);
        });
    },
    [authorizedRequest, ensuredNames, groupsApi],
  );

  const value = useMemo(
    () => ({
      actions: store.actions,
      ensureGroup,
      ensuredNames,
      getState: store.getState,
      state,
    }),
    [ensureGroup, ensuredNames, state, store],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useGroupsStore(): Value {
  const value = useContext(Context);
  if (!value)
    throw new Error("useGroupsStore must be used inside GroupsProvider.");
  return value;
}

/**
 * Display name of a group already known to this account's store (the open
 * detail first, then the cached list, then the E7b/C8 ensure-cache). `null`
 * until a query has seen it, so callers show a neutral fallback (`그룹`)
 * instead of a stale name -- and this triggers exactly one `ensureGroup`
 * fetch per miss, so `topics-screen.tsx` (group home) and
 * `use-chatroom-title.ts` (chatroom title) both self-heal a cache miss
 * without either file calling this provider directly.
 */
export function useGroupName(groupId: string): string | null {
  const { ensuredNames, ensureGroup, state } = useGroupsStore();
  const fromDetail =
    state.detail.id === groupId ? state.detail.group?.name : undefined;
  const fromList = state.list.items.find((item) => item.id === groupId)?.name;
  const name = fromDetail ?? fromList ?? ensuredNames[groupId] ?? null;
  useEffect(() => {
    if (name === null) ensureGroup(groupId);
  }, [ensureGroup, groupId, name]);
  return name;
}
