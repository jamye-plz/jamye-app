import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import type { AccountPrincipal } from "@/core/database/account/types";
import type { TopicsRepository } from "@/core/database/account/topics-types";
import type { TopicsStore, AuthorizedTopicsRequest } from "./topics-store";
import { initialTopicsState } from "./topics-state";

export type TopicsStoreFactory = (
  principal: AccountPrincipal,
  repository: TopicsRepository,
  authorize: AuthorizedTopicsRequest,
  watchGroup: (id: string) => Promise<void>,
) => TopicsStore;
type Props = PropsWithChildren<
  Readonly<{
    principal: AccountPrincipal | null;
    repository: TopicsRepository | null;
    authorize: AuthorizedTopicsRequest;
    createStore: TopicsStoreFactory;
    watchGroup: (id: string) => Promise<void>;
    subscribeSync: (
      listener: (event: "changed" | "connected" | "evicted") => void,
    ) => () => void;
  }>
>;
const empty = initialTopicsState();
const readEmpty = () => empty;
const noopSubscribe = () => () => {};
type Value = Readonly<{
  state: ReturnType<TopicsStore["getState"]>;
  store: TopicsStore | null;
  ready: boolean;
}>;
const Context = createContext<Value | undefined>(undefined);

export function TopicsProvider(props: Props) {
  const principal = props.principal;
  return (
    <ScopedTopicsProvider
      key={JSON.stringify([
        principal?.origin,
        principal?.userId,
        principal?.epoch,
      ])}
      {...props}
    />
  );
}
function ScopedTopicsProvider({
  principal,
  repository,
  authorize,
  createStore,
  watchGroup,
  subscribeSync,
  children,
}: Props) {
  const [scopedPrincipal] = useState(principal);
  const authorizeRef = useRef(authorize);
  useLayoutEffect(() => {
    authorizeRef.current = authorize;
  }, [authorize]);
  const [forwardAuthorize] = useState(() => {
    const forward: AuthorizedTopicsRequest = (execute, signal) =>
      authorizeRef.current(execute, signal);
    return forward;
  });
  const store = useMemo(
    () =>
      scopedPrincipal && repository
        ? createStore(scopedPrincipal, repository, forwardAuthorize, watchGroup)
        : null,
    [scopedPrincipal, repository, forwardAuthorize, createStore, watchGroup],
  );
  const state = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getState ?? readEmpty,
    store?.getState ?? readEmpty,
  );
  useEffect(() => {
    if (!store) return;
    if (AppState.currentState !== null && AppState.currentState !== "active")
      store.actions.background();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void store.actions.foreground();
      else store.actions.background();
    });
    return () => {
      subscription?.remove();
      store.dispose();
    };
  }, [store]);
  useEffect(() => {
    if (!store) return;
    return subscribeSync(() => store.actions.signal());
  }, [store, subscribeSync]);
  const value = useMemo(
    () => ({ state, store, ready: Boolean(store) }),
    [state, store],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTopics() {
  const value = useContext(Context);
  if (!value) throw new Error("useTopics requires TopicsProvider.");
  return value;
}
