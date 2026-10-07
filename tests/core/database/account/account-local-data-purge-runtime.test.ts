import { createDefaultAccountLocalDataPurge } from "@/core/database/account/account-local-data-purge-runtime";

const DAY = 24 * 60 * 60 * 1000;
const NAME = `jamye-account-v1-${"d".repeat(64)}.db`;

const mockRegistry = { contents: null as string | null };
const mockDeleted: string[] = [];
const mockLogged: unknown[] = [];
let mockPresent = true;

jest.mock("@/core/database/account/account-purge-registry-file", () => ({
  createAccountPurgeRegistryFile: () => ({
    read: async () => mockRegistry.contents,
    write: async (contents: string) => {
      mockRegistry.contents = contents;
    },
  }),
}));

jest.mock("@/core/database/account/account-database-files", () => ({
  createAccountDatabaseFiles: () => ({
    deleteFiles: async (name: string) => {
      mockDeleted.push(name);
      mockPresent = false;
    },
    anyExist: async () => mockPresent,
  }),
}));

jest.mock("@/core/database/account/namespace", () => ({
  resolveAccountDatabaseFilename: async () => mockNameForTests(),
}));

jest.mock("@/core/logging/logger", () => ({
  consoleLoggerSink: {},
  createLogger: () => ({
    log: (...args: unknown[]) => {
      mockLogged.push(args);
    },
  }),
}));

function mockNameForTests() {
  return NAME;
}

describe("default account local data purge composition", () => {
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
  });

  test("records with the device clock and sweeps through the file adapters after 30 days", async () => {
    const purge = createDefaultAccountLocalDataPurge();
    const start = Date.parse("2026-11-01T00:00:00Z");
    Date.now = () => start;
    await purge.recordAccountDeletion({
      origin: "https://api.example",
      userId: "11111111-1111-4111-8111-111111111111",
    });
    expect(JSON.parse(mockRegistry.contents ?? "null")).toEqual({
      version: 1,
      entries: [{ databaseName: NAME, deletedAt: start }],
    });

    Date.now = () => start + 29 * DAY;
    await expect(purge.sweep()).resolves.toMatchObject({ due: 0 });
    expect(mockDeleted).toEqual([]);

    Date.now = () => start + 30 * DAY;
    await expect(purge.sweep()).resolves.toMatchObject({ removed: 1 });
    expect(mockDeleted).toEqual([NAME]);
    expect(JSON.parse(mockRegistry.contents ?? "null").entries).toEqual([]);
    expect(JSON.stringify(mockLogged)).not.toContain(NAME);
  });
});
