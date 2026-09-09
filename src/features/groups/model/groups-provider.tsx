import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";
import { parsePublicApiOrigin } from "@/core/config/public-env";
import type { SessionPrincipal } from "@/core/providers/session-provider";
import type {
  AuthorizedGroupsRequest,
  GroupsStore,
  GroupsStoreActions,
  GroupsState,
} from "./groups-store";

type Value = Readonly<{ state: GroupsState; actions: GroupsStoreActions }>;
type Props = PropsWithChildren<
  Readonly<{
    origin: string;
    principal: SessionPrincipal | null;
    authorizedRequest: AuthorizedGroupsRequest;
    createStore: (origin: string) => GroupsStore;
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
  const value = useMemo(
    () => ({ state, actions: store.actions }),
    [state, store],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useGroupsStore(): Value {
  const value = useContext(Context);
  if (!value)
    throw new Error("useGroupsStore must be used inside GroupsProvider.");
  return value;
}
