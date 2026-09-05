import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";
import { Text } from "react-native";

type DatabaseRepository = Readonly<{
  ensureFixtureConversation: (fixture: unknown) => Promise<void>;
  label: string;
}>;

type DatabaseResource = Readonly<{
  close: () => Promise<void>;
  repository: DatabaseRepository;
}>;

type DatabaseProviderFactory = () => Promise<DatabaseResource>;
type FileSystemModule = Readonly<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>;
type DatabaseProviderProps = Readonly<{
  children: ReactNode;
  databaseFactory?: DatabaseProviderFactory;
}>;
type DatabaseProviderModule = {
  DatabaseProvider?: unknown;
  productionDatabaseFactory?: unknown;
  useDatabaseRepository?: unknown;
};
type UseDatabaseRepository = () => DatabaseRepository;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error.code === "MODULE_NOT_FOUND" ||
      (typeof error.message === "string" &&
        error.message.includes("Cannot find module")))
  );
}

function loadDatabaseProviderContract(): {
  DatabaseProvider: ComponentType<DatabaseProviderProps>;
  productionDatabaseFactory: DatabaseProviderFactory;
  useDatabaseRepository: UseDatabaseRepository;
} {
  let module: DatabaseProviderModule;
  try {
    module = jest.requireActual<DatabaseProviderModule>(
      "../../../src/core/database/database-provider",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M5-RUNTIME-1 implementation missing: database-provider.tsx must export DatabaseProvider, productionDatabaseFactory, and useDatabaseRepository().",
      );
    }
    throw error;
  }

  if (
    typeof module.DatabaseProvider !== "function" ||
    typeof module.productionDatabaseFactory !== "function" ||
    typeof module.useDatabaseRepository !== "function"
  ) {
    throw new Error(
      "M5-RUNTIME-1 database-provider contract is incomplete: provide the exact lifecycle factory, component, and ready-only hook.",
    );
  }

  return {
    DatabaseProvider:
      module.DatabaseProvider as ComponentType<DatabaseProviderProps>,
    productionDatabaseFactory:
      module.productionDatabaseFactory as DatabaseProviderFactory,
    useDatabaseRepository:
      module.useDatabaseRepository as UseDatabaseRepository,
  };
}

function createRepository(
  label: string,
  seed?: () => Promise<void>,
): DatabaseRepository {
  return {
    ensureFixtureConversation: seed ?? (async () => undefined),
    label,
  };
}

function createDeferred<Value>() {
  let reject: (error: Error) => void = () => undefined;
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe("M5-RUNTIME-1 attempt-scoped SQLite database provider", () => {
  test("renders accessible loading, seeds before ready, then exposes only the selected repository", async () => {
    const pendingSeed = createDeferred<void>();
    const seed = jest.fn(() => pendingSeed.promise);
    const repository = createRepository("seeded", seed);
    const close = jest.fn(async () => undefined);
    const databaseFactory = jest.fn(async (): Promise<DatabaseResource> => ({
      close,
      repository,
    }));
    const { DatabaseProvider, useDatabaseRepository } =
      loadDatabaseProviderContract();

    function RepositoryProbe(): React.JSX.Element {
      return <Text>{useDatabaseRepository().label}</Text>;
    }

    const screen = await render(
      <DatabaseProvider databaseFactory={databaseFactory}>
        <RepositoryProbe />
      </DatabaseProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("불러오는 중...")).toBeTruthy();
    expect(screen.queryByText("seeded")).toBeNull();
    expect(seed).toHaveBeenCalledTimes(1);
    expect(databaseFactory).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();

    await act(async () => {
      pendingSeed.resolve();
      await pendingSeed.promise;
    });
    expect(await screen.findByText("seeded")).toBeTruthy();

    await screen.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("retries a rejected factory as a fresh attempt without closing a resource that never resolved", async () => {
    const repository = createRepository("retry-ready");
    const close = jest.fn(async () => undefined);
    const databaseFactory = jest
      .fn<Promise<DatabaseResource>, []>()
      .mockRejectedValueOnce(new Error("open failed"))
      .mockResolvedValueOnce({ close, repository });
    const { DatabaseProvider, useDatabaseRepository } =
      loadDatabaseProviderContract();

    function RepositoryProbe(): React.JSX.Element {
      return <Text>{useDatabaseRepository().label}</Text>;
    }

    const screen = await render(
      <DatabaseProvider databaseFactory={databaseFactory}>
        <RepositoryProbe />
      </DatabaseProvider>,
    );

    const retry = await screen.findByRole("button");
    expect(screen.queryByText("retry-ready")).toBeNull();
    expect(close).not.toHaveBeenCalled();

    await fireEvent.press(retry);

    expect(await screen.findByText("retry-ready")).toBeTruthy();
    expect(databaseFactory).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();
  });

  test("closes a seed-rejected resource once, publishes no fallback, and opens a fresh retry attempt", async () => {
    const rejectedClose = jest.fn(async () => undefined);
    const acceptedClose = jest.fn(async () => undefined);
    const rejectedRepository = createRepository(
      "must-not-publish",
      async () => {
        throw new Error("seed failed");
      },
    );
    const acceptedRepository = createRepository("seed-retry-ready");
    const databaseFactory = jest
      .fn<Promise<DatabaseResource>, []>()
      .mockResolvedValueOnce({
        close: rejectedClose,
        repository: rejectedRepository,
      })
      .mockResolvedValueOnce({
        close: acceptedClose,
        repository: acceptedRepository,
      });
    const { DatabaseProvider, useDatabaseRepository } =
      loadDatabaseProviderContract();

    function RepositoryProbe(): React.JSX.Element {
      return <Text>{useDatabaseRepository().label}</Text>;
    }

    const screen = await render(
      <DatabaseProvider databaseFactory={databaseFactory}>
        <RepositoryProbe />
      </DatabaseProvider>,
    );

    const retry = await screen.findByRole("button");
    expect(screen.queryByText("must-not-publish")).toBeNull();
    expect(rejectedClose).toHaveBeenCalledTimes(1);

    await fireEvent.press(retry);

    expect(await screen.findByText("seed-retry-ready")).toBeTruthy();
    expect(databaseFactory).toHaveBeenCalledTimes(2);
    expect(acceptedClose).not.toHaveBeenCalled();
  });

  test("closes stale resolved resources exactly once and lets only the replacement attempt publish", async () => {
    const stale = createDeferred<DatabaseResource>();
    const staleClose = jest.fn(async () => undefined);
    const replacementClose = jest.fn(async () => undefined);
    const replacementRepository = createRepository("replacement-ready");
    const firstFactory = jest.fn(() => stale.promise);
    const replacementFactory = jest.fn(async (): Promise<DatabaseResource> => ({
      close: replacementClose,
      repository: replacementRepository,
    }));
    const { DatabaseProvider, useDatabaseRepository } =
      loadDatabaseProviderContract();

    function RepositoryProbe(): React.JSX.Element {
      return <Text>{useDatabaseRepository().label}</Text>;
    }

    const screen = await render(
      <DatabaseProvider databaseFactory={firstFactory}>
        <RepositoryProbe />
      </DatabaseProvider>,
    );

    await screen.rerender(
      <DatabaseProvider databaseFactory={replacementFactory}>
        <RepositoryProbe />
      </DatabaseProvider>,
    );
    await act(async () => {
      stale.resolve({
        close: staleClose,
        repository: createRepository("stale-ready"),
      });
      await Promise.resolve();
    });

    expect(await screen.findByText("replacement-ready")).toBeTruthy();
    expect(screen.queryByText("stale-ready")).toBeNull();
    expect(staleClose).toHaveBeenCalledTimes(1);
    expect(replacementClose).not.toHaveBeenCalled();

    await screen.unmount();
    expect(replacementClose).toHaveBeenCalledTimes(1);
  });

  test("keeps replacement ready when a stale factory rejects after replacement", async () => {
    const stale = createDeferred<DatabaseResource>();
    const replacementRepository = createRepository("replacement-survives");
    const replacementFactory = jest.fn(async (): Promise<DatabaseResource> => ({
      close: async () => undefined,
      repository: replacementRepository,
    }));
    const firstFactory = jest.fn(() => stale.promise);
    const { DatabaseProvider, useDatabaseRepository } =
      loadDatabaseProviderContract();

    function RepositoryProbe(): React.JSX.Element {
      return <Text>{useDatabaseRepository().label}</Text>;
    }

    const screen = await render(
      <DatabaseProvider databaseFactory={firstFactory}>
        <RepositoryProbe />
      </DatabaseProvider>,
    );
    await screen.rerender(
      <DatabaseProvider databaseFactory={replacementFactory}>
        <RepositoryProbe />
      </DatabaseProvider>,
    );

    expect(await screen.findByText("replacement-survives")).toBeTruthy();
    await act(async () => {
      stale.reject(new Error("late stale failure"));
      await Promise.resolve();
    });

    expect(screen.getByText("replacement-survives")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(firstFactory).toHaveBeenCalledTimes(1);
    expect(replacementFactory).toHaveBeenCalledTimes(1);
  });

  test("closes a current resource once on factory replacement and closes the replacement once on unmount", async () => {
    const firstClose = jest.fn(async () => undefined);
    const replacementClose = jest.fn(async () => undefined);
    const firstFactory = jest.fn(async (): Promise<DatabaseResource> => ({
      close: firstClose,
      repository: createRepository("first-current"),
    }));
    const replacementFactory = jest.fn(async (): Promise<DatabaseResource> => ({
      close: replacementClose,
      repository: createRepository("replacement-current"),
    }));
    const { DatabaseProvider, useDatabaseRepository } =
      loadDatabaseProviderContract();

    function RepositoryProbe(): React.JSX.Element {
      return <Text>{useDatabaseRepository().label}</Text>;
    }

    const screen = await render(
      <DatabaseProvider databaseFactory={firstFactory}>
        <RepositoryProbe />
      </DatabaseProvider>,
    );
    expect(await screen.findByText("first-current")).toBeTruthy();

    await screen.rerender(
      <DatabaseProvider databaseFactory={replacementFactory}>
        <RepositoryProbe />
      </DatabaseProvider>,
    );

    expect(await screen.findByText("replacement-current")).toBeTruthy();
    expect(firstFactory).toHaveBeenCalledTimes(1);
    expect(replacementFactory).toHaveBeenCalledTimes(1);
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(replacementClose).not.toHaveBeenCalled();

    await screen.unmount();
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(replacementClose).toHaveBeenCalledTimes(1);
  });

  test("keeps native open, migration, repository creation, and typed fixture seed inside productionDatabaseFactory", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/core/database/database-provider.tsx`,
      "utf8",
    );

    expect(source).toMatch(
      /import\s*\{\s*openDatabaseAsync\s*\}\s*from\s*["']expo-sqlite["']/,
    );
    expect(source).toMatch(
      /import\s*\{\s*runMigrations\s*\}\s*from\s*["'][^"']*migrate["']/,
    );
    expect(source).toMatch(
      /import\s*\{\s*createDatabaseRepository\s*\}\s*from\s*["'][^"']*database-repository["']/,
    );
    expect(source).toMatch(
      /import\s*\{\s*FIXTURE_CONVERSATION_SEED\s*\}\s*from\s*["'][^"']*chat-fixture["']/,
    );
    expect(source).toMatch(/await\s+runMigrations\s*\(\s*database\s*\)/);
    expect(source).toMatch(/createDatabaseRepository\s*\(\s*database\s*\)/);
    expect(source).toMatch(
      /ensureFixtureConversation\s*\(\s*FIXTURE_CONVERSATION_SEED\s*,?\s*\)/,
    );
  });
});
