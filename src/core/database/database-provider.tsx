import { openDatabaseAsync } from "expo-sqlite";
import { createContext, useContext, useEffect, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { FIXTURE_CONVERSATION_SEED } from "@/features/chat/model/chat-fixture";

import { runMigrations } from "./migrate";
import { DATABASE_FILENAME } from "./open-database";
import { createDatabaseRepository } from "./repositories/database-repository";
import type { DatabaseRepository } from "./repositories/database-repository";

type DatabaseResource = Readonly<{
  close: () => Promise<void>;
  repository: DatabaseRepository;
}>;

export type DatabaseProviderFactory = () => Promise<DatabaseResource>;

type ProviderOutcome =
  | Readonly<{ error: Error; status: "error" }>
  | Readonly<{ repository: DatabaseRepository; status: "ready" }>;

export type DatabaseProviderProps = PropsWithChildren<{
  databaseFactory?: DatabaseProviderFactory;
}>;

const DatabaseRepositoryContext = createContext<DatabaseRepository | undefined>(
  undefined,
);

export const productionDatabaseFactory: DatabaseProviderFactory = async () => {
  const database = await openDatabaseAsync(DATABASE_FILENAME);

  try {
    await runMigrations(database);
    const repository = createDatabaseRepository(database);

    return {
      close: () => database.closeAsync(),
      repository,
    };
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
};

export function DatabaseProvider({
  children,
  databaseFactory = productionDatabaseFactory,
}: DatabaseProviderProps): ReactNode {
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [outcome, setOutcome] = useState<
    | (ProviderOutcome &
        Readonly<{
          databaseFactory: DatabaseProviderFactory;
          retryGeneration: number;
        }>)
    | undefined
  >();

  const currentOutcome =
    outcome?.databaseFactory === databaseFactory &&
    outcome.retryGeneration === retryGeneration
      ? outcome
      : undefined;

  useEffect(() => {
    let active = true;
    let resource: DatabaseResource | undefined;
    let closePromise: Promise<void> | undefined;

    const closeResource = async (): Promise<void> => {
      if (!resource) return;
      closePromise ??= resource.close().catch(() => undefined);
      await closePromise;
    };

    void (async () => {
      try {
        resource = await databaseFactory();
        if (!active) {
          await closeResource();
          return;
        }

        await resource.repository.ensureFixtureConversation(
          FIXTURE_CONVERSATION_SEED,
        );
        if (!active) {
          await closeResource();
          return;
        }

        setOutcome({
          databaseFactory,
          repository: resource.repository,
          retryGeneration,
          status: "ready",
        });
      } catch (error) {
        if (resource) await closeResource();
        if (!active) return;

        setOutcome({
          databaseFactory,
          error: error instanceof Error ? error : new Error(String(error)),
          retryGeneration,
          status: "error",
        });
      }
    })();

    return () => {
      active = false;
      void closeResource();
    };
  }, [databaseFactory, retryGeneration]);

  if (!currentOutcome) {
    return <LoadingBoundary />;
  }

  if (currentOutcome.status === "error") {
    return (
      <ErrorBoundary onRetry={() => setRetryGeneration((value) => value + 1)} />
    );
  }

  return (
    <DatabaseRepositoryContext.Provider value={currentOutcome.repository}>
      {children}
    </DatabaseRepositoryContext.Provider>
  );
}

export function useDatabaseRepository(): DatabaseRepository {
  const repository = useContext(DatabaseRepositoryContext);
  if (!repository) {
    throw new Error(
      "useDatabaseRepository must be used inside a ready DatabaseProvider.",
    );
  }
  return repository;
}

function LoadingBoundary(): React.JSX.Element {
  return (
    <View accessibilityLiveRegion="polite">
      <Text accessibilityRole="progressbar">불러오는 중...</Text>
    </View>
  );
}

function ErrorBoundary({
  onRetry,
}: Readonly<{ onRetry: () => void }>): React.JSX.Element {
  return (
    <View accessibilityRole="alert">
      <Text>로컬 데이터를 불러오지 못했습니다.</Text>
      <Pressable
        accessibilityLabel="로컬 데이터 다시 불러오기"
        accessibilityRole="button"
        onPress={onRetry}
      >
        <Text>로컬 데이터 다시 불러오기</Text>
      </Pressable>
    </View>
  );
}
