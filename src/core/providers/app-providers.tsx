import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { getPublicEnv } from "@/core/config/public-env";
import { createAccountScope as createDefaultAccountScope } from "@/core/database/account/account-scope";
import type {
  AccountScopeController,
  AccountScopeRenderedState,
} from "@/core/database/account/account-scope";
import { AppThemeProvider } from "@/core/theme/theme-provider";
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

export function AppProviders({
  children,
  databaseFactory = productionDatabaseFactory,
  clockFactory = createSystemClock,
  messageIdentityFactory = createMonotonicMessageIdentity,
  createSessionController,
  createAccountScope,
}: AppProvidersProps) {
  const env = getPublicEnv();

  return (
    <KeyboardProvider>
      <AppThemeProvider>
        {env.appMode === "connected-auth" ? (
          <ConnectedRuntimeProviders
            accountScopeFactory={createAccountScope}
            createSessionController={createSessionController}
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
}: PropsWithChildren<
  Readonly<{
    origin: string;
    createSessionController?: SessionProviderProps["createController"];
    accountScopeFactory?: () => AccountScopeController;
  }>
>) {
  return (
    <SessionProvider createController={createSessionController} origin={origin}>
      <AccountScopeBridge accountScopeFactory={accountScopeFactory}>
        {children}
      </AccountScopeBridge>
    </SessionProvider>
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
