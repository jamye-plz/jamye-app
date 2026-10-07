import { createAccountPurgeRegistry } from "@/core/database/account/account-purge-registry";
import type { AccountPurgeRegistryFile } from "@/core/database/account/account-purge-registry";
import {
  ACCOUNT_LOCAL_DATA_RETENTION_MS,
  createAccountLocalDataPurge,
} from "@/core/database/account/account-local-data-purge";
import type { AccountLocalDataPurge } from "@/core/database/account/account-local-data-purge";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-20T00:00:00.000Z");
const ORIGIN = "https://api.example";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_C = "33333333-3333-4333-8333-333333333333";

type Principal = Readonly<{ origin: string; userId: string }>;

function principal(userId: string): Principal {
  return { origin: ORIGIN, userId };
}

/** Deterministic stand-in for the sha256 database name (same shape). */
function nameOf(userId: string): string {
  return `jamye-account-v1-${userId.replace(/-/g, "").padEnd(64, "0")}.db`;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flush(times = 200) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

type Harness = ReturnType<typeof setup>;

function setup(options: { initialEntries?: Record<string, number> } = {}) {
  const state: {
    contents: string | null;
    now: number;
    events: string[];
    onRead: (() => void | Promise<void>) | null;
    onWrite: (() => void | Promise<void>) | null;
  } = {
    contents: options.initialEntries
      ? JSON.stringify({
          version: 1,
          entries: Object.entries(options.initialEntries).map(
            ([databaseName, deletedAt]) => ({ databaseName, deletedAt }),
          ),
        })
      : null,
    now: NOW,
    events: [],
    onRead: null,
    onWrite: null,
  };
  const registryFile: AccountPurgeRegistryFile = {
    read: jest.fn(async () => {
      if (state.onRead) await state.onRead();
      return state.contents;
    }),
    write: jest.fn(async (contents: string) => {
      if (state.onWrite) await state.onWrite();
      state.contents = contents;
    }),
  };
  const present = new Set<string>();
  const deleteHooks = {
    fail: new Set<string>(),
    leaveBehind: new Set<string>(),
    gate: null as null | Promise<void>,
  };
  const files = {
    deleteFiles: jest.fn(async (databaseName: string) => {
      state.events.push(`delete-start:${databaseName}`);
      if (deleteHooks.gate) await deleteHooks.gate;
      if (deleteHooks.fail.has(databaseName)) {
        throw new Error(`cannot delete ${databaseName}`);
      }
      if (!deleteHooks.leaveBehind.has(databaseName))
        present.delete(databaseName);
      state.events.push(`delete-end:${databaseName}`);
    }),
    anyExist: jest.fn(async (databaseName: string) =>
      present.has(databaseName),
    ),
  };
  const logger = { log: jest.fn() };
  const purge: AccountLocalDataPurge = createAccountLocalDataPurge({
    registry: createAccountPurgeRegistry(registryFile),
    files,
    clock: { nowMs: () => state.now },
    resolveDatabaseName: async (p) => nameOf(p.userId),
    logger,
  });
  function entries(): { databaseName: string; deletedAt: number }[] {
    return state.contents ? JSON.parse(state.contents).entries : [];
  }
  function seed(userId: string, deletedAt: number) {
    const databaseName = nameOf(userId);
    present.add(databaseName);
    const current = entries().filter((e) => e.databaseName !== databaseName);
    state.contents = JSON.stringify({
      version: 1,
      entries: [...current, { databaseName, deletedAt }],
    });
  }
  return {
    purge,
    state,
    files,
    logger,
    present,
    deleteHooks,
    entries,
    seed,
    registryFile,
  };
}

function serializedLogs(h: Harness): string {
  return JSON.stringify(h.logger.log.mock.calls);
}

describe("CLN-AC1 recording an account deletion", () => {
  test("stores the hashed database name and the device time, never the user id or origin", async () => {
    const h = setup();
    await h.purge.recordAccountDeletion(principal(USER_A));
    expect(h.entries()).toEqual([
      { databaseName: nameOf(USER_A), deletedAt: NOW },
    ]);
    expect(h.state.contents).not.toContain(USER_A);
    expect(h.state.contents).not.toContain(ORIGIN);
    expect(h.state.contents).not.toContain("example");
  });

  test("recording the same account again restarts the 30-day timer", async () => {
    const h = setup();
    await h.purge.recordAccountDeletion(principal(USER_A));
    h.state.now = NOW + 40 * DAY;
    await h.purge.recordAccountDeletion(principal(USER_A));
    expect(h.entries()).toEqual([
      { databaseName: nameOf(USER_A), deletedAt: NOW + 40 * DAY },
    ]);
  });

  test("a principal whose database name cannot be derived rejects without writing", async () => {
    const h = setup();
    const purge = createAccountLocalDataPurge({
      registry: createAccountPurgeRegistry(h.registryFile),
      files: h.files,
      clock: { nowMs: () => NOW },
      resolveDatabaseName: async () => {
        throw new Error("invalid principal");
      },
      logger: h.logger,
    });
    await expect(
      purge.recordAccountDeletion(principal(USER_A)),
    ).rejects.toThrow("invalid principal");
    expect(h.registryFile.write).not.toHaveBeenCalled();
  });
});

describe("CLN-AC3 startup sweep", () => {
  test("the retention window is exactly 30 * 24 hours", () => {
    expect(ACCOUNT_LOCAL_DATA_RETENTION_MS).toBe(30 * 24 * HOUR);
  });

  test("an entry at exactly 30 days is removed: files first, registry entry after", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 30 * DAY);
    await expect(h.purge.sweep()).resolves.toEqual({
      due: 1,
      removed: 1,
      skipped: 0,
      failed: 0,
    });
    expect(h.files.deleteFiles).toHaveBeenCalledWith(nameOf(USER_A));
    expect(h.entries()).toEqual([]);
    expect(h.present.has(nameOf(USER_A))).toBe(false);
  });

  test("an entry at 29 days 23 hours stays and nothing is deleted", async () => {
    const h = setup();
    h.seed(USER_A, NOW - (30 * DAY - HOUR));
    await expect(h.purge.sweep()).resolves.toEqual({
      due: 0,
      removed: 0,
      skipped: 0,
      failed: 0,
    });
    expect(h.files.deleteFiles).not.toHaveBeenCalled();
    expect(h.entries()).toHaveLength(1);
  });

  test("an entry timestamped in the future (clock rollback) is not due", async () => {
    const h = setup();
    h.seed(USER_A, NOW + DAY);
    await h.purge.sweep();
    expect(h.files.deleteFiles).not.toHaveBeenCalled();
    expect(h.entries()).toHaveLength(1);
  });

  test("only the due entries are removed; younger entries stay", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 45 * DAY);
    h.seed(USER_B, NOW - 5 * DAY);
    h.seed(USER_C, NOW - 31 * DAY);
    await expect(h.purge.sweep()).resolves.toEqual({
      due: 2,
      removed: 2,
      skipped: 0,
      failed: 0,
    });
    expect(h.files.deleteFiles.mock.calls.map(([name]) => name).sort()).toEqual(
      [nameOf(USER_A), nameOf(USER_C)].sort(),
    );
    expect(h.entries()).toEqual([
      { databaseName: nameOf(USER_B), deletedAt: NOW - 5 * DAY },
    ]);
  });

  test("the database of the currently open principal is skipped even when its cancel failed and the entry is still due", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.seed(USER_B, NOW - 40 * DAY);
    (h.registryFile.write as jest.Mock).mockRejectedValueOnce(
      new Error("cancel failed"),
    );
    await h.purge.setActivePrincipal(principal(USER_A));
    expect(h.entries()).toHaveLength(2);
    const result = await h.purge.sweep();
    expect(result).toMatchObject({ due: 2, removed: 1, skipped: 1, failed: 0 });
    expect(h.files.deleteFiles).not.toHaveBeenCalledWith(nameOf(USER_A));
    expect(h.files.deleteFiles).toHaveBeenCalledWith(nameOf(USER_B));
  });

  test("a signed-out device (no active principal) may remove any due entry", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    await h.purge.setActivePrincipal(principal(USER_B));
    await h.purge.setActivePrincipal(null);
    await expect(h.purge.sweep()).resolves.toMatchObject({ removed: 1 });
  });

  test("a delete failure keeps the entry and the next run retries it", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.deleteHooks.fail.add(nameOf(USER_A));
    await expect(h.purge.sweep()).resolves.toMatchObject({
      removed: 0,
      failed: 1,
    });
    expect(h.entries()).toHaveLength(1);

    h.deleteHooks.fail.clear();
    await expect(h.purge.sweep()).resolves.toMatchObject({
      removed: 1,
      failed: 0,
    });
    expect(h.entries()).toEqual([]);
  });

  test("the entry is dropped only after the files are confirmed gone", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.deleteHooks.leaveBehind.add(nameOf(USER_A));
    await expect(h.purge.sweep()).resolves.toMatchObject({
      removed: 0,
      failed: 1,
    });
    expect(h.entries()).toHaveLength(1);

    h.deleteHooks.leaveBehind.clear();
    await expect(h.purge.sweep()).resolves.toMatchObject({ removed: 1 });
    expect(h.entries()).toEqual([]);
  });

  test("a failure on one entry does not stop the others", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.seed(USER_B, NOW - 40 * DAY);
    h.deleteHooks.fail.add(nameOf(USER_A));
    await expect(h.purge.sweep()).resolves.toMatchObject({
      due: 2,
      removed: 1,
      failed: 1,
    });
    expect(h.entries().map((e) => e.databaseName)).toEqual([nameOf(USER_A)]);
  });

  test("when dropping the entry fails the entry stays and the next run finishes the job", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    (h.registryFile.write as jest.Mock).mockRejectedValueOnce(
      new Error("disk full"),
    );
    await expect(h.purge.sweep()).resolves.toMatchObject({
      removed: 0,
      failed: 1,
    });
    expect(h.entries()).toHaveLength(1);
    await expect(h.purge.sweep()).resolves.toMatchObject({ removed: 1 });
    expect(h.entries()).toEqual([]);
  });

  test("an unreadable or corrupt registry never throws and deletes nothing", async () => {
    const h = setup();
    h.state.contents = "{corrupt";
    await expect(h.purge.sweep()).resolves.toMatchObject({ due: 0 });
    (h.registryFile.read as jest.Mock).mockRejectedValueOnce(new Error("io"));
    await expect(h.purge.sweep()).resolves.toMatchObject({ removed: 0 });
    expect(h.files.deleteFiles).not.toHaveBeenCalled();
  });

  test("a registry entry whose files are already gone is dropped after the confirmation", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.present.clear();
    await expect(h.purge.sweep()).resolves.toMatchObject({ removed: 1 });
    expect(h.entries()).toEqual([]);
  });

  test("concurrent sweep calls share one run", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    const [first, second] = await Promise.all([
      h.purge.sweep(),
      h.purge.sweep(),
    ]);
    expect(first).toEqual(second);
    expect(h.files.deleteFiles).toHaveBeenCalledTimes(1);
    // Once settled, a later call is a fresh run.
    await h.purge.sweep();
    expect(h.files.deleteFiles).toHaveBeenCalledTimes(1);
  });
});

describe("CLN-AC4 cancel when the same principal's scope opens", () => {
  test("drops that principal's entry and keeps the database and the other entries", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 10 * DAY);
    h.seed(USER_B, NOW - 10 * DAY);
    await h.purge.setActivePrincipal(principal(USER_A));
    expect(h.entries().map((e) => e.databaseName)).toEqual([nameOf(USER_B)]);
    expect(h.files.deleteFiles).not.toHaveBeenCalled();
    expect(h.present.has(nameOf(USER_A))).toBe(true);
  });

  test("a restored account is not removed even after the 30 days pass", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 10 * DAY);
    await h.purge.setActivePrincipal(principal(USER_A));
    h.state.now = NOW + 60 * DAY;
    await h.purge.setActivePrincipal(null);
    await h.purge.sweep();
    expect(h.files.deleteFiles).not.toHaveBeenCalled();
  });

  test("activating a principal without an entry writes nothing; clearing never touches the registry", async () => {
    const h = setup();
    await h.purge.setActivePrincipal(principal(USER_A));
    await h.purge.setActivePrincipal(null);
    expect(h.registryFile.write).not.toHaveBeenCalled();
  });

  test("a failed cancel never throws to the caller and is logged without identifiers", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 10 * DAY);
    (h.registryFile.write as jest.Mock).mockRejectedValueOnce(
      new Error(`io ${USER_A}`),
    );
    await expect(
      h.purge.setActivePrincipal(principal(USER_A)),
    ).resolves.toBeUndefined();
    expect(h.logger.log).toHaveBeenCalledWith(
      expect.any(String),
      "warn",
      expect.any(Object),
    );
    expect(serializedLogs(h)).not.toContain(USER_A);
    expect(serializedLogs(h)).not.toContain(nameOf(USER_A));
  });

  test("a principal whose database name cannot be derived is tolerated", async () => {
    const h = setup();
    const purge = createAccountLocalDataPurge({
      registry: createAccountPurgeRegistry(h.registryFile),
      files: h.files,
      clock: { nowMs: () => NOW },
      resolveDatabaseName: async () => {
        throw new Error("invalid principal");
      },
      logger: h.logger,
    });
    h.seed(USER_A, NOW - 40 * DAY);
    await expect(
      purge.setActivePrincipal(principal(USER_A)),
    ).resolves.toBeUndefined();
    await expect(purge.sweep()).resolves.toMatchObject({ removed: 1 });
  });
});

describe("SHIP fix: a swallowed cancel name failure is logged", () => {
  test("a name-derivation failure while cancelling logs one fixed warn event with no identifiers and still resolves", async () => {
    const h = setup();
    const purge = createAccountLocalDataPurge({
      registry: createAccountPurgeRegistry(h.registryFile),
      files: h.files,
      clock: { nowMs: () => NOW },
      resolveDatabaseName: async () => {
        throw new Error(`invalid ${USER_A} ${ORIGIN}`);
      },
      logger: h.logger,
    });
    await expect(
      purge.setActivePrincipal(principal(USER_A)),
    ).resolves.toBeUndefined();
    expect(h.logger.log).toHaveBeenCalledWith(
      "account.local-data-purge.cancel-name-failed",
      "warn",
      {},
    );
    const logs = serializedLogs(h);
    expect(logs).not.toContain(USER_A);
    expect(logs).not.toContain(ORIGIN);
    expect(logs).not.toContain("invalid");
  });

  test("a resolvable principal logs nothing when the cancel succeeds", async () => {
    const h = setup();
    await h.purge.setActivePrincipal(principal(USER_A));
    expect(h.logger.log).not.toHaveBeenCalled();
  });
});

describe("CLN-AC5 silent, identifier-free operation", () => {
  test("logs only counts and fixed event names for a successful sweep and a failure", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.seed(USER_B, NOW - 40 * DAY);
    h.deleteHooks.fail.add(nameOf(USER_B));
    await h.purge.sweep();
    expect(h.logger.log).toHaveBeenCalled();
    const logs = serializedLogs(h);
    for (const forbidden of [
      USER_A,
      USER_B,
      ORIGIN,
      nameOf(USER_A),
      nameOf(USER_B),
      "jamye-account",
      "cannot delete",
    ]) {
      expect(logs).not.toContain(forbidden);
    }
  });

  test("a sweep with nothing due logs nothing", async () => {
    const h = setup();
    h.seed(USER_A, NOW - DAY);
    await h.purge.sweep();
    expect(h.logger.log).not.toHaveBeenCalled();
  });

  test("a logger that throws can never break the sweep", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.logger.log.mockImplementation(() => {
      throw new Error("sink down");
    });
    await expect(h.purge.sweep()).resolves.toMatchObject({ removed: 1 });
  });
});

describe("CLN-AC8 races between scope open, cancel and sweep", () => {
  test("a scope that becomes active just before the delete is never deleted (and its entry is cancelled)", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    let reads = 0;
    let cancel: Promise<void> = Promise.resolve();
    h.state.onRead = () => {
      reads += 1;
      // read 1 builds the due list; read 2 is the re-check right before the
      // delete -- the principal's scope opens exactly there.
      if (reads === 2) cancel = h.purge.setActivePrincipal(principal(USER_A));
    };
    const result = await h.purge.sweep();
    await cancel;
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(result).toMatchObject({ removed: 0, skipped: 1 });
    expect(h.files.deleteFiles).not.toHaveBeenCalled();
    expect(h.present.has(nameOf(USER_A))).toBe(true);
    expect(h.entries()).toEqual([]);
  });

  test("a scope that becomes active while its name is still resolving is still protected", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    const gate = deferred();
    const purge = createAccountLocalDataPurge({
      registry: createAccountPurgeRegistry(h.registryFile),
      files: h.files,
      clock: { nowMs: () => h.state.now },
      resolveDatabaseName: async (p) => {
        await gate.promise;
        return nameOf(p.userId);
      },
      logger: h.logger,
    });
    const sweeping = purge.sweep();
    const cancel = purge.setActivePrincipal(principal(USER_A));
    gate.resolve();
    await Promise.all([sweeping, cancel]);
    expect(h.files.deleteFiles).not.toHaveBeenCalled();
    expect(h.present.has(nameOf(USER_A))).toBe(true);
  });

  test("an entry cancelled or restarted between the due list and the re-check is not deleted", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.seed(USER_B, NOW - 40 * DAY);
    let reads = 0;
    h.state.onRead = () => {
      reads += 1;
      if (reads === 2) {
        // Between the list and the first re-check, A's entry is restarted
        // (deleted again just now) and B's entry vanishes (cancelled).
        h.state.contents = JSON.stringify({
          version: 1,
          entries: [{ databaseName: nameOf(USER_A), deletedAt: NOW - DAY }],
        });
      }
    };
    const result = await h.purge.sweep();
    expect(result).toMatchObject({ due: 2, removed: 0, skipped: 2 });
    expect(h.files.deleteFiles).not.toHaveBeenCalled();
  });

  test("a sweep started during a cancel waits for it and never deletes the cancelled database", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.seed(USER_B, NOW - 40 * DAY);
    const releaseWrite = deferred();
    h.state.onWrite = async () => {
      h.state.events.push("cancel-write-pending");
      await releaseWrite.promise;
      h.state.events.push("cancel-write-done");
      h.state.onWrite = null;
    };
    const cancel = h.purge.setActivePrincipal(principal(USER_B));
    const sweeping = h.purge.sweep();
    await flush();
    expect(h.files.deleteFiles).not.toHaveBeenCalled();
    releaseWrite.resolve();
    const [, result] = await Promise.all([cancel, sweeping]);
    expect(result).toMatchObject({ due: 1, removed: 1 });
    expect(h.files.deleteFiles.mock.calls).toEqual([[nameOf(USER_A)]]);
    expect(h.state.events.indexOf("cancel-write-done")).toBeLessThan(
      h.state.events.indexOf(`delete-start:${nameOf(USER_A)}`),
    );
    expect(h.present.has(nameOf(USER_B))).toBe(true);
    expect(h.entries()).toEqual([]);
  });

  test("a cancel arriving mid-delete waits for that delete, then drops its own entry; the account database open also waits", async () => {
    const h = setup();
    h.seed(USER_A, NOW - 40 * DAY);
    h.seed(USER_B, NOW - 10 * DAY);
    const gate = deferred();
    h.deleteHooks.gate = gate.promise;
    const sweeping = h.purge.sweep();
    await flush();
    expect(h.state.events).toEqual([`delete-start:${nameOf(USER_A)}`]);

    const cancel = h.purge.setActivePrincipal(principal(USER_B));
    const opened = h.purge.gateAccountOpen(async () => {
      h.state.events.push("open");
      return "handle";
    });
    await flush();
    expect(h.state.events).toEqual([`delete-start:${nameOf(USER_A)}`]);

    gate.resolve();
    await expect(sweeping).resolves.toMatchObject({ removed: 1 });
    await cancel;
    await expect(opened).resolves.toBe("handle");
    expect(h.state.events).toEqual([
      `delete-start:${nameOf(USER_A)}`,
      `delete-end:${nameOf(USER_A)}`,
      "open",
    ]);
    expect(h.entries()).toEqual([]);
    expect(h.present.has(nameOf(USER_B))).toBe(true);
  });

  test("gateAccountOpen returns the open result, propagates its failure, and does not wedge later work", async () => {
    const h = setup();
    await expect(h.purge.gateAccountOpen(async () => 7)).resolves.toBe(7);
    await expect(
      h.purge.gateAccountOpen(async () => {
        throw new Error("open failed");
      }),
    ).rejects.toThrow("open failed");
    h.seed(USER_A, NOW - 40 * DAY);
    await expect(h.purge.sweep()).resolves.toMatchObject({ removed: 1 });
  });
});
