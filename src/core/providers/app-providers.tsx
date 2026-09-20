import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { randomUUID } from "expo-crypto";

import { getPublicEnv } from "@/core/config/public-env";
import { createAccountScope as createDefaultAccountScope } from "@/core/database/account/account-scope";
import type {
  AccountScopeController,
  AccountScopeRenderedState,
} from "@/core/database/account/account-scope";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import {
  createGroupsApi,
  GroupsApiError,
} from "@/features/groups/data/groups-api";
import {
  createTopicsApi,
  TopicsApiError,
} from "@/features/topics/data/topics-api";
import { createTopicsStore } from "@/features/topics/model/topics-store";
import {
  TopicsProvider,
  type TopicsStoreFactory,
} from "@/features/topics/model/topics-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type { GroupsStore } from "@/features/groups/model/groups-store";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createChatApi } from "@/features/chat/data/chat-api";
import { MediaProvider } from "@/features/media/ui/media-provider";
import { PushTapHandoffListener } from "@/features/notifications/ui/push-tap-handoff-listener";
import { PushLifecycleProvider } from "@/features/notifications/model/push-lifecycle-provider";
import {
  createConnectedChatStore,
  toCanonicalUpsert,
  toHistoryUpsert,
} from "@/features/chat/model/connected-chat-store";
import type { ConnectedChatSyncFactory } from "@/features/chat/model/connected-chat-store";
import { mapCanonicalChatMessage } from "@/core/contracts/server";
import { createAccountSync } from "@/features/sync/model/account-sync";
import {
  createSyncApi,
  realtimeSocketUrl,
} from "@/features/sync/realtime/sync-api";
import { createRealtimeSocket } from "@/features/sync/realtime/realtime-socket";
import {
  ConnectedChatProvider,
  useConnectedChat,
} from "@/features/chat/model/connected-chat-provider";
import {
  createMonotonicMessageIdentity,
  createSystemClock,
} from "@/features/chat/model/chat-send";
import type {
  ClockPort,
  MessageIdentityPort,
} from "@/features/chat/model/chat-send";

import {
  DatabaseProvider,
  productionDatabaseFactory,
  useDatabaseRepository,
} from "../database/database-provider";
import type { DatabaseProviderFactory } from "../database/database-provider";
import type { DatabaseRepository } from "../database/repositories/database-repository";

import { SessionProvider, useSession } from "./session-provider";
import type { SessionProviderProps } from "./session-provider";

export type AppProvidersProps = PropsWithChildren<{
  clockFactory?: () => ClockPort;
  databaseFactory?: DatabaseProviderFactory;
  messageIdentityFactory?: () => MessageIdentityPort;
  createSessionController?: SessionProviderProps["createController"];
  createAccountScope?: () => AccountScopeController;
  createGroupsStore?: (origin: string) => GroupsStore;
}>;

export type AppRuntimeDependencies = Readonly<{
  clock: ClockPort;
  messageIdentity: MessageIdentityPort;
  repository: DatabaseRepository;
}>;

export type AccountScopeContextValue = Readonly<{
  state: AccountScopeRenderedState;
  retry: () => void;
}>;

const AppRuntimeContext = createContext<AppRuntimeDependencies | undefined>(
  undefined,
);
const AccountScopeContext = createContext<AccountScopeContextValue | undefined>(
  undefined,
);
function createDefaultGroupsStore(): GroupsStore {
  return createGroupsStore({ createApi: createGroupsApi });
}

const createDefaultTopicsStore: TopicsStoreFactory = (
  principal,
  repository,
  authorize,
  watchGroup,
) => {
  const groupsApi = createGroupsApi(principal.origin);
  return createTopicsStore({
    api: createTopicsApi(principal.origin),
    repository,
    userId: principal.userId,
    authorize,
    newKey: randomUUID,
    watchGroup,
    async getOwner(groupId, signal) {
      try {
        const group = await authorize(
          (token, authSignal) => groupsApi.getGroup(token, groupId, authSignal),
          signal,
        );
        if (group.id !== groupId)
          throw new TopicsApiError(502, "invalid_group_identity");
        return group.ownerId;
      } catch (error) {
        if (error instanceof GroupsApiError)
          throw new TopicsApiError(error.status, error.code);
        throw error;
      }
    },
  });
};

/** Concrete IO is connected only here; sync models receive account-fenced ports. */
export const createConnectedAccountSync: ConnectedChatSyncFactory = (
  binding,
) => {
  const chatApi = createChatApi(binding.principal.origin);
  const syncApi = createSyncApi(binding.principal.origin);
  // Bounded C2 work can continue on a later drain without holding all history in JS.
  const historyProgress = new Map<string, { marker: string; before: string }>();
  return createAccountSync({
    ...binding,
    createLeaseToken: randomUUID,
    createRequestId: randomUUID,
    createSocket: createRealtimeSocket,
    nowMs: Date.now,
    random: Math.random,
    socketUrl: (ticket) =>
      realtimeSocketUrl(binding.principal.origin, ticket.ticket),
    listEvents: (roomId, after, signal) =>
      binding.authorize(
        (token, authSignal) =>
          syncApi.listEvents(
            token,
            roomId,
            { after: after ?? undefined, limit: 100 },
            authSignal,
          ),
        signal,
      ),
    issueTicket: (signal) =>
      binding.authorize(
        (token, authSignal) => syncApi.issueTicket(token, authSignal),
        signal,
      ),
    send: (command, signal) =>
      binding.authorize(async (token, authSignal) => {
        const result = await chatApi.sendChatMessage(
          token,
          command.chatroomId,
          {
            body: command.body,
            clientMessageId: command.clientMsgId,
            ...(command.mediaUploadIds?.length
              ? { mediaUploadIds: command.mediaUploadIds }
              : {}),
          },
          authSignal,
        );
        // Do not replace the response client_msg_id: the dispatcher verifies it.
        return toCanonicalUpsert(result.message, command.localId);
      }, signal),
    mapMessage: (wire) => toCanonicalUpsert(mapCanonicalChatMessage(wire)),
    async refreshHistory(roomId, signal) {
      const current = () => binding.isActive() && !signal.aborted;
      const incomplete = { complete: false, messages: [] } as const;
      if (!current()) return incomplete;
      const dirty =
        await binding.repository.listDirtyReconciliationScopes(roomId);
      if (!current()) return incomplete;
      const marker =
        dirty.find((scope) => scope.scope === "chat_history")?.markerEventId ??
        "";
      const progress = historyProgress.get(roomId);
      let before = progress?.marker === marker ? progress.before : undefined;
      const seen = new Set<string | undefined>();
      for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
        if (!current() || seen.has(before)) return incomplete;
        seen.add(before);
        const page = await binding.authorize(
          (token, authSignal) =>
            chatApi.listChatroomMessages(
              token,
              roomId,
              { before, limit: 100 },
              authSignal,
            ),
          signal,
        );
        if (!current()) return incomplete;
        if (page.items.some((message) => message.chatroomId !== roomId))
          return incomplete;
        if (page.items.length > 0) {
          await binding.repository.mergeHistoryMessages(
            page.items.map(toHistoryUpsert),
          );
          if (!current()) return incomplete;
          await binding.onChanged();
          if (!current()) return incomplete;
        }
        if (page.nextCursor === null) {
          historyProgress.delete(roomId);
          // Only delta's exact marker-fenced transaction may clear the dirty scope.
          return { complete: true, messages: [] };
        }
        if (page.items.length === 0 || page.nextCursor === before)
          return incomplete;
        before = page.nextCursor;
        historyProgress.set(roomId, { marker, before });
      }
      return incomplete;
    },
  });
};

function createDefaultChatStore() {
  return createConnectedChatStore({
    createApi: createChatApi,
    createSync: createConnectedAccountSync,
    clock: createSystemClock(),
    messageIdentity: {
      next: () => ({
        clientMsgId: randomUUID(),
        commandId: randomUUID(),
        localId: randomUUID(),
      }),
    },
  });
}

export function AppProviders({
  children,
  databaseFactory = productionDatabaseFactory,
  clockFactory = createSystemClock,
  messageIdentityFactory = createMonotonicMessageIdentity,
  createSessionController,
  createAccountScope,
  createGroupsStore: groupsStoreFactory,
}: AppProvidersProps) {
  const env = getPublicEnv();

  return (
    <KeyboardProvider>
      <AppThemeProvider>
        {env.appMode === "connected-auth" ? (
          <ConnectedRuntimeProviders
            accountScopeFactory={createAccountScope}
            createSessionController={createSessionController}
            groupsStoreFactory={groupsStoreFactory}
            origin={requireConnectedOrigin(env.apiOrigin)}
          >
            {children}
          </ConnectedRuntimeProviders>
        ) : (
          <FixtureRuntimeProviders
            databaseFactory={databaseFactory}
            clockFactory={clockFactory}
            messageIdentityFactory={messageIdentityFactory}
          >
            {children}
          </FixtureRuntimeProviders>
        )}
      </AppThemeProvider>
    </KeyboardProvider>
  );
}

function FixtureRuntimeProviders({
  children,
  databaseFactory,
  clockFactory,
  messageIdentityFactory,
}: PropsWithChildren<
  Readonly<{
    databaseFactory: DatabaseProviderFactory;
    clockFactory: () => ClockPort;
    messageIdentityFactory: () => MessageIdentityPort;
  }>
>) {
  const [clock] = useState(clockFactory);
  const [messageIdentity] = useState(messageIdentityFactory);
  return (
    <DatabaseProvider databaseFactory={databaseFactory}>
      <AppRuntimeBridge clock={clock} messageIdentity={messageIdentity}>
        {children}
      </AppRuntimeBridge>
    </DatabaseProvider>
  );
}

function requireConnectedOrigin(origin: string | undefined): string {
  if (!origin) throw new Error("connected-auth requires an API origin.");
  return origin;
}

function ConnectedRuntimeProviders({
  children,
  origin,
  createSessionController,
  accountScopeFactory,
  groupsStoreFactory,
}: PropsWithChildren<
  Readonly<{
    origin: string;
    createSessionController?: SessionProviderProps["createController"];
    accountScopeFactory?: () => AccountScopeController;
    groupsStoreFactory?: (origin: string) => GroupsStore;
  }>
>) {
  return (
    <SessionProvider createController={createSessionController} origin={origin}>
      {/* Self-contained: reads useSession() internally, drives the
       * notifications-store singleton's account-scoped setPrincipal, and
       * wires A2's adapter tap/foreground listeners. */}
      <PushTapHandoffListener />
      <PushLifecycleProvider origin={origin}>
        <MediaProvider>
          <AccountScopeBridge accountScopeFactory={accountScopeFactory}>
            <GroupsStoreBridge
              origin={origin}
              groupsStoreFactory={groupsStoreFactory}
            >
              <ChatStoreBridge>
                <TopicsStoreBridge>{children}</TopicsStoreBridge>
              </ChatStoreBridge>
            </GroupsStoreBridge>
          </AccountScopeBridge>
        </MediaProvider>
      </PushLifecycleProvider>
    </SessionProvider>
  );
}

function TopicsStoreBridge({ children }: PropsWithChildren) {
  const { principal, authorizedRequest } = useSession();
  const { state } = useAccountScope();
  const chat = useConnectedChat();
  return (
    <TopicsProvider
      principal={principal}
      repository={state?.status === "ready" ? state.topicsRepository : null}
      authorize={authorizedRequest}
      createStore={createDefaultTopicsStore}
      watchGroup={chat.actions.loadRooms}
      subscribeSync={chat.subscribeSync}
    >
      {children}
    </TopicsProvider>
  );
}

function ChatStoreBridge({ children }: PropsWithChildren) {
  const { principal, authorizedRequest } = useSession();
  const { state } = useAccountScope();
  return (
    <ConnectedChatProvider
      principal={principal}
      repository={
        state?.status === "ready" ? state.connectedChatRepository : null
      }
      authorizedRequest={authorizedRequest}
      createStore={createDefaultChatStore}
    >
      {children}
    </ConnectedChatProvider>
  );
}

function AccountScopeBridge({
  children,
  accountScopeFactory = createDefaultAccountScope,
}: PropsWithChildren<
  Readonly<{ accountScopeFactory?: () => AccountScopeController }>
>) {
  const { principal } = useSession();
  const [scope] = useState<AccountScopeController>(accountScopeFactory);
  // Bind every notification to the principal that actually opened this scope.
  // A changed session is hidden synchronously, before effects close the old DB.
  const [snapshot, setSnapshot] = useState<{
    principal: typeof principal;
    state: AccountScopeRenderedState;
  }>(() => ({
    principal: null,
    state: scope.getState(),
  }));

  useEffect(() => {
    const unsubscribe = scope.subscribe(() =>
      setSnapshot({
        principal,
        state: scope.getState(),
      }),
    );
    scope.setPrincipal(principal);
    return unsubscribe;
  }, [scope, principal]);

  useEffect(() => () => scope.setPrincipal(null), [scope]);

  const value = useMemo<AccountScopeContextValue>(
    () => ({
      retry: () => scope.setPrincipal(principal),
      state: !principal
        ? null
        : snapshot.principal === principal
          ? snapshot.state
          : { status: "opening" },
    }),
    [scope, principal, snapshot],
  );

  return (
    <AccountScopeContext.Provider value={value}>
      {children}
    </AccountScopeContext.Provider>
  );
}

export function useAccountScope(): AccountScopeContextValue {
  const value = useContext(AccountScopeContext);
  if (!value) {
    throw new Error(
      "useAccountScope must be used inside AppProviders' connected-auth mode.",
    );
  }
  return value;
}

function GroupsStoreBridge({
  children,
  origin,
  groupsStoreFactory = createDefaultGroupsStore,
}: PropsWithChildren<
  Readonly<{
    origin: string;
    groupsStoreFactory?: (origin: string) => GroupsStore;
  }>
>) {
  const { principal, authorizedRequest } = useSession();
  return (
    <GroupsProvider
      origin={origin}
      principal={principal}
      authorizedRequest={authorizedRequest}
      createStore={groupsStoreFactory}
    >
      {children}
    </GroupsProvider>
  );
}

function AppRuntimeBridge({
  children,
  clock,
  messageIdentity,
}: PropsWithChildren<
  Readonly<{
    clock: ClockPort;
    messageIdentity: MessageIdentityPort;
  }>
>) {
  const repository = useDatabaseRepository();

  return (
    <AppRuntimeContext.Provider value={{ clock, messageIdentity, repository }}>
      {children}
    </AppRuntimeContext.Provider>
  );
}

export function useAppRuntime(): AppRuntimeDependencies {
  const runtime = useContext(AppRuntimeContext);
  if (!runtime) {
    throw new Error("useAppRuntime must be used inside AppProviders.");
  }
  return runtime;
}
