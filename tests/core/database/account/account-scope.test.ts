type SqliteValue = string | number | null;
type SqliteRow = Record<string, SqliteValue>;

type SqliteRepositoryDatabase = {
  getAllAsync: <Row extends SqliteRow>(statement: string) => Promise<Row[]>;
  getFirstAsync: <Row extends SqliteRow>(
    statement: string,
  ) => Promise<Row | null>;
  runAsync: (
    statement: string,
  ) => Promise<Readonly<{ changes: number; lastInsertRowId: number }>>;
  withExclusiveTransactionAsync: (
    operation: (transaction: SqliteRepositoryDatabase) => Promise<void>,
  ) => Promise<void>;
};

type AccountPrincipal = Readonly<{
  epoch: number;
  origin: string;
  userId: string;
}>;

type AccountScopeHandle = Readonly<{
  close: () => Promise<void>;
  database: SqliteRepositoryDatabase;
  connectedChatRepository?: unknown;
}>;

type AccountScopeOpenPort = (
  principal: AccountPrincipal,
) => Promise<AccountScopeHandle>;

type AccountScopeRenderedState =
  | null
  | Readonly<{ status: "opening" }>
  | Readonly<{
      database: SqliteRepositoryDatabase;
      connectedChatRepository?: unknown;
      status: "ready";
    }>
  | Readonly<{ error: Error; status: "error" }>;

type AccountScopeController = Readonly<{
  getState: () => AccountScopeRenderedState;
  setPrincipal: (principal: AccountPrincipal | null) => void;
  subscribe: (listener: () => void) => () => void;
}>;

type AccountScopeModule = {
  createAccountScope?: unknown;
};

type CreateAccountScope = (
  openAccountDatabase: AccountScopeOpenPort,
) => AccountScopeController;

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

function loadAccountScopeContract(): {
  createAccountScope: CreateAccountScope;
} {
  let module: AccountScopeModule;
  try {
    module = jest.requireActual<AccountScopeModule>(
      "../../../../src/core/database/account/account-scope",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M6-03 implementation missing: src/core/database/account/account-scope.ts must export createAccountScope().",
      );
    }
    throw error;
  }
  if (typeof module.createAccountScope !== "function") {
    throw new Error(
      "M6-03 account-scope contract is incomplete: createAccountScope(openAccountDatabase) must be exported.",
    );
  }
  return {
    createAccountScope: module.createAccountScope as CreateAccountScope,
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

function fakeDatabase(label: string): SqliteRepositoryDatabase {
  return {
    getAllAsync: async () => [],
    getFirstAsync: async <Row extends SqliteRow>() =>
      ({ label }) as unknown as Row,
    runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
    withExclusiveTransactionAsync: async (operation) =>
      operation({
        getAllAsync: async () => [],
        getFirstAsync: async () => null,
        runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
        withExclusiveTransactionAsync: async () => undefined,
      }),
  };
}

function principal(
  overrides: Partial<AccountPrincipal> = {},
): AccountPrincipal {
  return {
    epoch: 1,
    origin: "https://api.jamye.example",
    userId: "a1b2c3d4-e5f6-47a8-99b0-1234567890ab",
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("M6-03 injected account scope lifecycle fenced by SessionPrincipal.epoch", () => {
  test("forwards the handle's already-fenced chat repository without creating a second adapter", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const repository = Object.freeze({ owner: "opened-account-handle" });
    const close = jest.fn().mockResolvedValue(undefined);
    const scope = createAccountScope(async () => ({
      database: fakeDatabase("ready"),
      close,
      connectedChatRepository: repository,
    }));
    scope.setPrincipal(principal());
    await flush();
    const state = scope.getState();
    expect(state?.status).toBe("ready");
    if (state?.status === "ready")
      expect(state.connectedChatRepository).toBe(repository);
    scope.setPrincipal(null);
    expect(scope.getState()).toBeNull();
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
  });
  test("waits for a superseded pending open and its close before exposing the successor", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const first = createDeferred<AccountScopeHandle>();
    const closing = createDeferred<void>();
    const close = jest.fn(() => closing.promise);
    const nextDatabase = fakeDatabase("next");
    const open = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({
        database: nextDatabase,
        close: async () => undefined,
      });
    const scope = createAccountScope(open);
    scope.setPrincipal(principal());
    await flush();
    scope.setPrincipal(principal({ epoch: 2 }));
    await flush();
    expect(scope.getState()).toEqual({ status: "opening" });
    first.resolve({ database: fakeDatabase("abandoned"), close });
    await flush();
    expect(scope.getState()).toEqual({ status: "opening" });
    expect(close).toHaveBeenCalledTimes(1);
    closing.resolve();
    await flush();
    expect(scope.getState()).toEqual({
      status: "ready",
      database: nextDatabase,
    });
  });

  test("retains a failed sign-out close for explicit retry before another account can open", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const failure = new Error("close failed");
    const close = jest.fn().mockRejectedValue(failure);
    const nextDatabase = fakeDatabase("next");
    const open = jest
      .fn()
      .mockResolvedValueOnce({ database: fakeDatabase("old"), close })
      .mockResolvedValue({
        database: nextDatabase,
        close: async () => undefined,
      });
    const scope = createAccountScope(open);
    scope.setPrincipal(principal());
    await flush();
    scope.setPrincipal(null);
    await flush();
    scope.setPrincipal(principal({ epoch: 2 }));
    await flush();
    expect(scope.getState()).toEqual({ status: "error", error: failure });
    close.mockResolvedValue(undefined);
    scope.setPrincipal(principal({ epoch: 2 }));
    await flush();
    expect(scope.getState()).toEqual({
      status: "ready",
      database: nextDatabase,
    });
  });
  test("renders null before any principal, opening while the port is in flight, then ready with the opened database", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const deferredHandle = createDeferred<AccountScopeHandle>();
    const open = jest.fn<Promise<AccountScopeHandle>, [AccountPrincipal]>(
      () => deferredHandle.promise,
    );
    const scope = createAccountScope(open);

    expect(scope.getState()).toBeNull();

    scope.setPrincipal(principal());
    expect(scope.getState()).toEqual({ status: "opening" });
    expect(open).toHaveBeenCalledWith(principal());

    const close = jest.fn(async () => undefined);
    const database = fakeDatabase("ready");
    deferredHandle.resolve({ close, database });
    await flush();

    expect(scope.getState()).toEqual({ database, status: "ready" });
    expect(close).not.toHaveBeenCalled();
  });

  test("invalidates immediately to null on sign-out and closes the active handle", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const close = jest.fn(async () => undefined);
    const database = fakeDatabase("ready");
    const open = jest.fn(async () => ({ close, database }));
    const scope = createAccountScope(open);

    scope.setPrincipal(principal());
    await flush();
    expect(scope.getState()).toEqual({ database, status: "ready" });

    scope.setPrincipal(null);
    expect(scope.getState()).toBeNull();
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("drains the previous ready handle before publishing the new ready state on account switch", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const firstCloseDeferred = createDeferred<void>();
    const firstDatabase = fakeDatabase("first");
    const secondDatabase = fakeDatabase("second");
    const open = jest
      .fn<Promise<AccountScopeHandle>, [AccountPrincipal]>()
      .mockImplementationOnce(async () => ({
        close: () => firstCloseDeferred.promise,
        database: firstDatabase,
      }))
      .mockImplementationOnce(async () => ({
        close: async () => undefined,
        database: secondDatabase,
      }));
    const scope = createAccountScope(open);

    scope.setPrincipal(
      principal({ userId: "aaaaaaaa-1111-4111-8111-111111111111" }),
    );
    await flush();
    expect(scope.getState()).toEqual({
      database: firstDatabase,
      status: "ready",
    });

    scope.setPrincipal(
      principal({ epoch: 2, userId: "bbbbbbbb-2222-4222-8222-222222222222" }),
    );
    expect(open).toHaveBeenCalledTimes(1);
    await flush();
    // Neither opening nor publishing the successor may precede the old close.
    expect(scope.getState()).toEqual({ status: "opening" });

    firstCloseDeferred.resolve();
    await flush();

    expect(open).toHaveBeenCalledTimes(2);
    expect(scope.getState()).toEqual({
      database: secondDatabase,
      status: "ready",
    });
  });

  test("discards a late-resolving retry at the same epoch and closes its abandoned handle instead of publishing it", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const staleClose = jest.fn(async () => undefined);
    const staleDeferred = createDeferred<AccountScopeHandle>();
    const freshClose = jest.fn(async () => undefined);
    const freshDatabase = fakeDatabase("fresh");
    const open = jest
      .fn<Promise<AccountScopeHandle>, [AccountPrincipal]>()
      .mockImplementationOnce(() => staleDeferred.promise)
      .mockImplementationOnce(async () => ({
        close: freshClose,
        database: freshDatabase,
      }));
    const scope = createAccountScope(open);
    const retryPrincipal = principal();

    scope.setPrincipal(retryPrincipal);
    scope.setPrincipal(retryPrincipal);
    await flush();

    expect(scope.getState()).toEqual({ status: "opening" });

    staleDeferred.resolve({
      close: staleClose,
      database: fakeDatabase("stale"),
    });
    await flush();

    expect(scope.getState()).toEqual({
      database: freshDatabase,
      status: "ready",
    });
    expect(staleClose).toHaveBeenCalledTimes(1);
    expect(freshClose).not.toHaveBeenCalled();
  });

  test("discards a late rejection from a superseded attempt before publishing the successor", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const staleDeferred = createDeferred<AccountScopeHandle>();
    const freshDatabase = fakeDatabase("fresh");
    const open = jest
      .fn<Promise<AccountScopeHandle>, [AccountPrincipal]>()
      .mockImplementationOnce(() => staleDeferred.promise)
      .mockImplementationOnce(async () => ({
        close: async () => undefined,
        database: freshDatabase,
      }));
    const scope = createAccountScope(open);
    const retryPrincipal = principal();

    scope.setPrincipal(retryPrincipal);
    scope.setPrincipal(retryPrincipal);
    await flush();
    expect(scope.getState()).toEqual({ status: "opening" });

    staleDeferred.reject(new Error("late stale failure"));
    await flush();

    expect(scope.getState()).toEqual({
      database: freshDatabase,
      status: "ready",
    });
  });

  test("publishes an error state on open failure without falling back to any other database", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const open = jest.fn(async () => {
      throw new Error("account open failed");
    });
    const scope = createAccountScope(open);

    scope.setPrincipal(principal());
    await flush();

    const state = scope.getState();
    expect(state && "status" in state ? state.status : undefined).toBe("error");
    expect(state && "error" in state ? state.error.message : undefined).toBe(
      "account open failed",
    );
  });

  test("calls the open port with matching origin/userId when returning to the same account after sign-out", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const close = jest.fn(async () => undefined);
    const open = jest.fn(async (requested: AccountPrincipal) => ({
      close,
      database: fakeDatabase(requested.userId),
    }));
    const scope = createAccountScope(open);
    const returningPrincipal = principal();

    scope.setPrincipal(returningPrincipal);
    await flush();
    scope.setPrincipal(null);
    await flush();
    scope.setPrincipal({ ...returningPrincipal, epoch: 2 });
    await flush();

    expect(open).toHaveBeenCalledTimes(2);
    const [[firstCallPrincipal], [secondCallPrincipal]] = open.mock.calls;
    expect(firstCallPrincipal.origin).toBe(secondCallPrincipal.origin);
    expect(firstCallPrincipal.userId).toBe(secondCallPrincipal.userId);
  });

  test("notifies subscribers on every state change and stops notifying after unsubscribe", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const database = fakeDatabase("ready");
    const open = jest.fn(async () => ({
      close: async () => undefined,
      database,
    }));
    const scope = createAccountScope(open);
    const listener = jest.fn();
    const unsubscribe = scope.subscribe(listener);

    scope.setPrincipal(principal());
    await flush();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);

    unsubscribe();
    const callsAfterUnsubscribe = listener.mock.calls.length;
    scope.setPrincipal(null);
    await flush();

    expect(listener.mock.calls.length).toBe(callsAfterUnsubscribe);
  });

  test("keeps draining an abandoned handle across an intervening sign-out so a fast next scope is not published ready until it settles", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const closeADeferred = createDeferred<void>();
    const databaseA = fakeDatabase("A");
    const databaseB = fakeDatabase("B");
    const open = jest
      .fn<Promise<AccountScopeHandle>, [AccountPrincipal]>()
      .mockImplementationOnce(async () => ({
        close: () => closeADeferred.promise,
        database: databaseA,
      }))
      .mockImplementationOnce(async () => ({
        close: async () => undefined,
        database: databaseB,
      }));
    const scope = createAccountScope(open);

    scope.setPrincipal(
      principal({ userId: "aaaaaaaa-1111-4111-8111-111111111111" }),
    );
    await flush();
    expect(scope.getState()).toEqual({ database: databaseA, status: "ready" });

    scope.setPrincipal(null);
    expect(scope.getState()).toBeNull();

    scope.setPrincipal(
      principal({ epoch: 2, userId: "bbbbbbbb-2222-4222-8222-222222222222" }),
    );
    await flush();
    // B's open already resolved, but A's close (kicked off by the intervening
    // sign-out) has not settled yet, so the drain chain must still gate B.
    expect(scope.getState()).toEqual({ status: "opening" });

    closeADeferred.resolve();
    await flush();

    expect(scope.getState()).toEqual({ database: databaseB, status: "ready" });
  });

  test("fails visibly with an error state instead of publishing ready when the prior handle's close rejects", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const closeFailure = new Error("stale close failed");
    const databaseA = fakeDatabase("A");
    const databaseB = fakeDatabase("B");
    const closeB = jest.fn(async () => undefined);
    const open = jest
      .fn<Promise<AccountScopeHandle>, [AccountPrincipal]>()
      .mockImplementationOnce(async () => ({
        close: async () => {
          throw closeFailure;
        },
        database: databaseA,
      }))
      .mockImplementationOnce(async () => ({
        close: closeB,
        database: databaseB,
      }));
    const scope = createAccountScope(open);

    scope.setPrincipal(
      principal({ userId: "aaaaaaaa-1111-4111-8111-111111111111" }),
    );
    await flush();
    expect(scope.getState()).toEqual({ database: databaseA, status: "ready" });

    scope.setPrincipal(
      principal({ epoch: 2, userId: "bbbbbbbb-2222-4222-8222-222222222222" }),
    );
    await flush();

    const state = scope.getState();
    expect(state && "status" in state ? state.status : undefined).toBe("error");
    expect(state && "error" in state ? state.error.message : undefined).toBe(
      "stale close failed",
    );
    // Failed drainage prevents even opening the successor; no new handle leaks.
    expect(open).toHaveBeenCalledTimes(1);
    expect(closeB).not.toHaveBeenCalled();
  });

  test("publishes an error state instead of throwing when the injected open port throws synchronously", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const open = jest.fn(() => {
      throw new Error("synchronous opener failure");
    }) as unknown as AccountScopeOpenPort;
    const scope = createAccountScope(open);

    expect(() => scope.setPrincipal(principal())).not.toThrow();
    await flush();

    const state = scope.getState();
    expect(state && "status" in state ? state.status : undefined).toBe("error");
    expect(state && "error" in state ? state.error.message : undefined).toBe(
      "synchronous opener failure",
    );
  });

  test("publishes an error state instead of throwing when the prior handle's injected close throws synchronously", async () => {
    const { createAccountScope } = loadAccountScopeContract();
    const database = fakeDatabase("ready");
    const open = jest
      .fn<Promise<AccountScopeHandle>, [AccountPrincipal]>()
      .mockImplementationOnce(async () => ({
        close: () => {
          throw new Error("synchronous close failure");
        },
        database,
      }))
      .mockImplementationOnce(async () => ({
        close: async () => undefined,
        database: fakeDatabase("next"),
      }));
    const scope = createAccountScope(open);

    scope.setPrincipal(
      principal({ userId: "aaaaaaaa-1111-4111-8111-111111111111" }),
    );
    await flush();
    expect(scope.getState()).toEqual({ database, status: "ready" });

    expect(() =>
      scope.setPrincipal(
        principal({ epoch: 2, userId: "bbbbbbbb-2222-4222-8222-222222222222" }),
      ),
    ).not.toThrow();
    await flush();

    const state = scope.getState();
    expect(state && "status" in state ? state.status : undefined).toBe("error");
    expect(state && "error" in state ? state.error.message : undefined).toBe(
      "synchronous close failure",
    );
  });
});
