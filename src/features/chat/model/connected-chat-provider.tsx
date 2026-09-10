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
import type { AccountPrincipal } from "@/core/database/account/types";
import type { ConnectedChatRepository } from "@/core/database/account/connected-chat-types";
import type {
  AuthorizedChatRequest,
  ConnectedChatStore,
  ConnectedChatStoreActions,
  ConnectedChatState,
} from "./connected-chat-store";

type Props = PropsWithChildren<
  Readonly<{
    principal: AccountPrincipal | null;
    repository: ConnectedChatRepository | null;
    authorizedRequest: AuthorizedChatRequest;
    createStore: () => ConnectedChatStore;
  }>
>;
type Value = Readonly<{
  state: ConnectedChatState;
  actions: ConnectedChatStoreActions;
  ready: boolean;
}>;
const Context = createContext<Value | undefined>(undefined);

export function ConnectedChatProvider(props: Props) {
  const p = props.principal;
  return (
    <ScopedChatProvider
      key={JSON.stringify([p?.origin, p?.userId, p?.epoch])}
      {...props}
    />
  );
}

function ScopedChatProvider({
  principal,
  repository,
  authorizedRequest,
  createStore,
  children,
}: Props) {
  const [scopedPrincipal] = useState(principal);
  const [initialAuthorize] = useState(() => authorizedRequest);
  const store = useMemo(() => {
    const value = createStore();
    value.setPrincipal(scopedPrincipal, repository, initialAuthorize);
    if (AppState.currentState !== null && AppState.currentState !== "active")
      value.actions.background();
    return value;
  }, [repository, createStore, initialAuthorize, scopedPrincipal]);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  useEffect(() => {
    store.setPrincipal(scopedPrincipal, repository, authorizedRequest);
  }, [store, scopedPrincipal, repository, authorizedRequest]);
  useEffect(() => {
    let previous = AppState.currentState;
    if (previous === "active") void store.actions.foreground();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") store.actions.background();
      else if (previous !== "active") void store.actions.foreground();
      previous = next;
    });
    return () => {
      subscription?.remove();
      store.dispose();
    };
  }, [store]);
  const value = useMemo(
    () => ({
      state,
      actions: store.actions,
      ready: Boolean(principal && repository),
    }),
    [state, store, principal, repository],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useConnectedChat(): Value {
  const value = useContext(Context);
  if (!value)
    throw new Error(
      "useConnectedChat must be used inside ConnectedChatProvider.",
    );
  return value;
}
