import { createAccountDatabaseFiles } from "@/core/database/account/account-database-files";

const NAME = `jamye-account-v1-${"c".repeat(64)}.db`;

const mockFiles = new Set<string>();
const mockCalls: string[] = [];
const mockConfig = { dir: "/data/SQLite", deleteFails: false };

jest.mock("expo-sqlite", () => ({
  get defaultDatabaseDirectory() {
    return mockConfig.dir;
  },
  deleteDatabaseAsync: jest.fn(async (...args: unknown[]) => {
    mockCalls.push(`deleteDatabaseAsync:${args.map(String).join(",")}`);
    if (mockConfig.deleteFails) throw new Error("database is open");
    mockFiles.delete(`file:///data/SQLite/${String(args[0])}`);
  }),
}));

jest.mock("expo-file-system", () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part : part.uri))
        .join("/");
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockCalls.push(`delete:${this.uri}`);
      if (!mockFiles.has(this.uri)) throw new Error("missing");
      mockFiles.delete(this.uri);
    }
  }
  return { File: MockFile };
});

const uri = (suffix = "") => `file:///data/SQLite/${NAME}${suffix}`;

beforeEach(() => {
  mockFiles.clear();
  mockCalls.length = 0;
  mockConfig.dir = "/data/SQLite";
  mockConfig.deleteFails = false;
});

describe("CLN-AC3 account database file deletion", () => {
  test("deletes the main file through deleteDatabaseAsync and the -wal, -shm and -journal files explicitly", async () => {
    for (const suffix of ["", "-wal", "-shm", "-journal"])
      mockFiles.add(uri(suffix));
    const files = createAccountDatabaseFiles();
    await expect(files.anyExist(NAME)).resolves.toBe(true);
    await files.deleteFiles(NAME);
    expect(mockCalls[0]).toBe(`deleteDatabaseAsync:${NAME}`);
    expect(mockCalls).toEqual(
      expect.arrayContaining([
        `delete:${uri("-wal")}`,
        `delete:${uri("-shm")}`,
        `delete:${uri("-journal")}`,
      ]),
    );
    expect(mockFiles.size).toBe(0);
    await expect(files.anyExist(NAME)).resolves.toBe(false);
  });

  // VERIFY fix 3: defense in depth -- deleteFiles has its own name guard and
  // does not rely on the purge registry's validation.
  test.each([
    "other.db",
    "../escape.db",
    `${NAME}/../other.db`,
    `${NAME}-wal`,
    `jamye-account-v1-${"C".repeat(64)}.db`,
    `jamye-account-v1-${"c".repeat(63)}.db`,
    `jamye-account-v1-${"c".repeat(65)}.db`,
    `x${NAME}`,
    `${NAME}\n`,
    "",
  ])(
    "deleteFiles refuses the non-account name %j and deletes nothing",
    async (name) => {
      for (const suffix of ["", "-wal", "-shm", "-journal"])
        mockFiles.add(`file:///data/SQLite/${name}${suffix}`);
      const before = mockFiles.size;
      await createAccountDatabaseFiles().deleteFiles(name);
      expect(mockCalls).toEqual([]);
      expect(mockFiles.size).toBe(before);
    },
  );

  test("a missing sidecar is not an error", async () => {
    mockFiles.add(uri());
    mockFiles.add(uri("-wal"));
    await createAccountDatabaseFiles().deleteFiles(NAME);
    expect(mockFiles.size).toBe(0);
  });

  test("sidecars left behind without a main file are still removed and deleteDatabaseAsync is not called", async () => {
    mockFiles.add(uri("-wal"));
    mockFiles.add(uri("-shm"));
    await createAccountDatabaseFiles().deleteFiles(NAME);
    expect(mockFiles.size).toBe(0);
    expect(
      mockCalls.some((call) => call.startsWith("deleteDatabaseAsync")),
    ).toBe(false);
  });

  test("when the main file cannot be deleted (open database) the sidecars are left alone and the error propagates", async () => {
    mockFiles.add(uri());
    mockFiles.add(uri("-wal"));
    mockConfig.deleteFails = true;
    await expect(
      createAccountDatabaseFiles().deleteFiles(NAME),
    ).rejects.toThrow("database is open");
    expect(mockFiles.has(uri("-wal"))).toBe(true);
    expect(mockCalls.some((call) => call.startsWith("delete:"))).toBe(false);
  });

  test("anyExist reports a lone leftover sidecar", async () => {
    mockFiles.add(uri("-journal"));
    await expect(createAccountDatabaseFiles().anyExist(NAME)).resolves.toBe(
      true,
    );
  });

  test("a directory that already carries a file:// scheme is not double-prefixed", async () => {
    mockConfig.dir = "file:///data/SQLite";
    mockFiles.add(uri());
    await expect(createAccountDatabaseFiles().anyExist(NAME)).resolves.toBe(
      true,
    );
  });
});
