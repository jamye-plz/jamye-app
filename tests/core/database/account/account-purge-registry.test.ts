import {
  ACCOUNT_PURGE_REGISTRY_VERSION,
  createAccountPurgeRegistry,
} from "@/core/database/account/account-purge-registry";
import type { AccountPurgeRegistryFile } from "@/core/database/account/account-purge-registry";

const NAME_A = `jamye-account-v1-${"a".repeat(64)}.db`;
const NAME_B = `jamye-account-v1-${"b".repeat(64)}.db`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function memoryFile(initial: string | null = null) {
  const state: { contents: string | null; events: string[] } = {
    contents: initial,
    events: [],
  };
  const file: AccountPurgeRegistryFile = {
    read: jest.fn(async () => {
      state.events.push("read");
      return state.contents;
    }),
    write: jest.fn(async (contents: string) => {
      state.events.push("write");
      state.contents = contents;
    }),
  };
  return { file, state };
}

function stored(state: { contents: string | null }) {
  return JSON.parse(state.contents ?? "null");
}

describe("CLN-AC2 account purge registry (versioned JSON)", () => {
  test("a missing file reads as an empty registry", async () => {
    const { file } = memoryFile(null);
    await expect(createAccountPurgeRegistry(file).list()).resolves.toEqual([]);
  });

  test.each([
    ["not json", "{not json"],
    ["empty text", ""],
    ["json null", "null"],
    ["a bare array", "[]"],
    ["an unknown version", JSON.stringify({ version: 99, entries: [] })],
    ["a missing version", JSON.stringify({ entries: [] })],
    [
      "non-array entries",
      JSON.stringify({ version: ACCOUNT_PURGE_REGISTRY_VERSION, entries: {} }),
    ],
  ])("a corrupt file (%s) reads as an empty registry", async (_label, text) => {
    const { file } = memoryFile(text);
    await expect(createAccountPurgeRegistry(file).list()).resolves.toEqual([]);
  });

  test("malformed entries are dropped one by one and valid ones survive", async () => {
    const { file } = memoryFile(
      JSON.stringify({
        version: ACCOUNT_PURGE_REGISTRY_VERSION,
        entries: [
          { databaseName: NAME_A, deletedAt: 1000 },
          { databaseName: "../../etc/passwd", deletedAt: 1000 },
          { databaseName: "jamye-account-v1-short.db", deletedAt: 1000 },
          { databaseName: NAME_B, deletedAt: -1 },
          { databaseName: NAME_B, deletedAt: Number.NaN },
          { databaseName: NAME_B, deletedAt: "1000" },
          { databaseName: NAME_B },
          null,
          "text",
          { databaseName: NAME_B, deletedAt: 2000, userId: "ignored-extra" },
        ],
      }),
    );
    await expect(createAccountPurgeRegistry(file).list()).resolves.toEqual([
      { databaseName: NAME_A, deletedAt: 1000 },
      { databaseName: NAME_B, deletedAt: 2000 },
    ]);
  });

  test("upsert writes a versioned file holding only databaseName and deletedAt", async () => {
    const { file, state } = memoryFile(null);
    await createAccountPurgeRegistry(file).upsert({
      databaseName: NAME_A,
      deletedAt: 1234,
    });
    expect(stored(state)).toEqual({
      version: ACCOUNT_PURGE_REGISTRY_VERSION,
      entries: [{ databaseName: NAME_A, deletedAt: 1234 }],
    });
    expect(Object.keys(stored(state).entries[0]).sort()).toEqual([
      "databaseName",
      "deletedAt",
    ]);
  });

  test("upsert replaces an existing entry for the same database (the timer restarts)", async () => {
    const { file, state } = memoryFile(null);
    const registry = createAccountPurgeRegistry(file);
    await registry.upsert({ databaseName: NAME_A, deletedAt: 1000 });
    await registry.upsert({ databaseName: NAME_B, deletedAt: 1500 });
    await registry.upsert({ databaseName: NAME_A, deletedAt: 9000 });
    expect(stored(state).entries).toEqual([
      { databaseName: NAME_B, deletedAt: 1500 },
      { databaseName: NAME_A, deletedAt: 9000 },
    ]);
  });

  test("upsert over a corrupt file starts a fresh registry", async () => {
    const { file, state } = memoryFile("{broken");
    await createAccountPurgeRegistry(file).upsert({
      databaseName: NAME_A,
      deletedAt: 5,
    });
    expect(stored(state).entries).toEqual([
      { databaseName: NAME_A, deletedAt: 5 },
    ]);
  });

  test("remove drops only the named entry and skips the write when it is absent", async () => {
    const { file, state } = memoryFile(null);
    const registry = createAccountPurgeRegistry(file);
    await registry.upsert({ databaseName: NAME_A, deletedAt: 1 });
    await registry.upsert({ databaseName: NAME_B, deletedAt: 2 });
    await registry.remove(NAME_A);
    expect(stored(state).entries).toEqual([
      { databaseName: NAME_B, deletedAt: 2 },
    ]);
    const writesBefore = (file.write as jest.Mock).mock.calls.length;
    await registry.remove(NAME_A);
    expect((file.write as jest.Mock).mock.calls.length).toBe(writesBefore);
  });

  test("concurrent mutations are serialized so no update is lost", async () => {
    const gate = deferred();
    const { file, state } = memoryFile(null);
    let firstWrite = true;
    (file.write as jest.Mock).mockImplementation(async (contents: string) => {
      state.events.push("write-start");
      if (firstWrite) {
        firstWrite = false;
        await gate.promise;
      }
      state.contents = contents;
      state.events.push("write-end");
    });
    const registry = createAccountPurgeRegistry(file);
    const first = registry.upsert({ databaseName: NAME_A, deletedAt: 1 });
    const second = registry.upsert({ databaseName: NAME_B, deletedAt: 2 });
    const third = registry.remove(NAME_A);
    await Promise.resolve();
    gate.resolve();
    await Promise.all([first, second, third]);
    expect(stored(state).entries).toEqual([
      { databaseName: NAME_B, deletedAt: 2 },
    ]);
    // The second mutation reads only after the first write has landed.
    expect(state.events.slice(0, 4)).toEqual([
      "read",
      "write-start",
      "write-end",
      "read",
    ]);
  });

  test("an I/O error on read rejects instead of being mistaken for an empty registry, and nothing is written", async () => {
    const { file } = memoryFile(null);
    (file.read as jest.Mock).mockRejectedValueOnce(new Error("io"));
    const registry = createAccountPurgeRegistry(file);
    await expect(
      registry.upsert({ databaseName: NAME_A, deletedAt: 1 }),
    ).rejects.toThrow("io");
    expect(file.write).not.toHaveBeenCalled();
    // The failed mutation does not wedge the queue.
    await expect(
      registry.upsert({ databaseName: NAME_A, deletedAt: 1 }),
    ).resolves.toBeUndefined();
    expect(file.write).toHaveBeenCalledTimes(1);
  });

  test("a failed write rejects and leaves the queue usable", async () => {
    const { file } = memoryFile(null);
    (file.write as jest.Mock).mockRejectedValueOnce(new Error("disk full"));
    const registry = createAccountPurgeRegistry(file);
    await expect(
      registry.upsert({ databaseName: NAME_A, deletedAt: 1 }),
    ).rejects.toThrow("disk full");
    await expect(registry.list()).resolves.toEqual([]);
  });
});
