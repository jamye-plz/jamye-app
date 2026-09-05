import { createContext, useContext, useState } from "react";
import type { PropsWithChildren } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { getPublicEnv } from "@/core/config/public-env";
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

export type AppProvidersProps = PropsWithChildren<{
  clockFactory?: () => ClockPort;
  databaseFactory?: DatabaseProviderFactory;
  messageIdentityFactory?: () => MessageIdentityPort;
}>;

export type AppRuntimeDependencies = Readonly<{
  clock: ClockPort;
  messageIdentity: MessageIdentityPort;
  repository: DatabaseRepository;
}>;

const AppRuntimeContext = createContext<AppRuntimeDependencies | undefined>(
  undefined,
);

export function AppProviders({
  children,
  databaseFactory = productionDatabaseFactory,
  clockFactory = createSystemClock,
  messageIdentityFactory = createMonotonicMessageIdentity,
}: AppProvidersProps) {
  getPublicEnv();
  const [clock] = useState<ClockPort>(clockFactory);
  const [messageIdentity] = useState<MessageIdentityPort>(
    messageIdentityFactory,
  );

  return (
    <KeyboardProvider>
      <AppThemeProvider>
        <DatabaseProvider databaseFactory={databaseFactory}>
          <AppRuntimeBridge clock={clock} messageIdentity={messageIdentity}>
            {children}
          </AppRuntimeBridge>
        </DatabaseProvider>
      </AppThemeProvider>
    </KeyboardProvider>
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
