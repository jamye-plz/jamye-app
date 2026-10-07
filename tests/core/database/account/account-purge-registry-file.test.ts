import {
  ACCOUNT_PURGE_REGISTRY_FILENAME,
  createAccountPurgeRegistryFile,
} from "@/core/database/account/account-purge-registry-file";

const mockFiles = new Map<string, string>();
const mockOps: string[] = [];
const mockFailures = { writeTmp: false };

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
    create(options?: { overwrite?: boolean }) {
      mockOps.push(`create:${this.uri}`);
      if (mockFiles.has(this.uri) && !options?.overwrite)
        throw new Error("exists");
      mockFiles.set(this.uri, "");
    }
    write(content: string) {
      mockOps.push(`write:${this.uri}`);
      if (mockFailures.writeTmp) throw new Error("disk full");
      if (!mockFiles.has(this.uri)) throw new Error("missing");
      mockFiles.set(this.uri, content);
    }
    async text() {
      const content = mockFiles.get(this.uri);
      if (content === undefined) throw new Error("missing");
      return content;
    }
    async move(destination: MockFile, options?: { overwrite?: boolean }) {
      mockOps.push(`move:${this.uri}->${destination.uri}`);
      if (mockFiles.has(destination.uri) && !options?.overwrite)
        throw new Error("destination exists");
      const content = mockFiles.get(this.uri);
      if (content === undefined) throw new Error("missing");
      mockFiles.set(destination.uri, content);
      mockFiles.delete(this.uri);
    }
  }
  return { File: MockFile, Paths: { document: { uri: "file:///docs" } } };
});

const FINAL_URI = `file:///docs/${ACCOUNT_PURGE_REGISTRY_FILENAME}`;

beforeEach(() => {
  mockFiles.clear();
  mockOps.length = 0;
  mockFailures.writeTmp = false;
});

describe("CLN-AC2 document-directory registry file", () => {
  test("the registry lives in the documents directory", () => {
    expect(ACCOUNT_PURGE_REGISTRY_FILENAME).toMatch(/\.json$/);
  });

  test("read returns null when the file does not exist", async () => {
    await expect(createAccountPurgeRegistryFile().read()).resolves.toBeNull();
  });

  test("read returns the stored text", async () => {
    mockFiles.set(FINAL_URI, '{"version":1,"entries":[]}');
    await expect(createAccountPurgeRegistryFile().read()).resolves.toBe(
      '{"version":1,"entries":[]}',
    );
  });

  test("write stages a temp file and moves it over the registry (atomic replace)", async () => {
    mockFiles.set(FINAL_URI, "old");
    await createAccountPurgeRegistryFile().write("new");
    expect(mockFiles.get(FINAL_URI)).toBe("new");
    expect(mockFiles.size).toBe(1);
    const tmpUri = `${FINAL_URI}.tmp`;
    expect(mockOps).toEqual([
      `create:${tmpUri}`,
      `write:${tmpUri}`,
      `move:${tmpUri}->${FINAL_URI}`,
    ]);
    expect(mockOps.some((op) => op === `write:${FINAL_URI}`)).toBe(false);
  });

  test("write works when no registry exists yet", async () => {
    await createAccountPurgeRegistryFile().write("first");
    expect(mockFiles.get(FINAL_URI)).toBe("first");
  });

  test("a failed staging write leaves the previous registry intact", async () => {
    mockFiles.set(FINAL_URI, "old");
    mockFailures.writeTmp = true;
    await expect(createAccountPurgeRegistryFile().write("new")).rejects.toThrow(
      "disk full",
    );
    expect(mockFiles.get(FINAL_URI)).toBe("old");
  });
});
