import { MAX_VIDEO_BYTES } from "@/features/media/model/media-policy";
import {
  allocateStagingDestination,
  cleanupAllStagedFiles,
  createNativeMediaFileCleanupPort,
  isOwnedStagedFile,
  removeStagedFile,
  retainStagedFile,
  stageOwnedCopy,
} from "@/features/media/platform/media-staging";

const mockFsState = {
  copiedSize: null as number | null,
  copyCalls: [] as Readonly<{ destination: string; source: string }>[],
  copyShouldFail: false,
  createCalls: [] as string[],
  deleteCalls: [] as string[],
  directories: new Set<string>(),
  files: new Map<string, number>(),
  uuidCounter: 0,
};

jest.mock("expo-crypto", () => ({
  randomUUID: () => `staging-uuid-${++mockFsState.uuidCounter}`,
}));

jest.mock("expo-file-system", () => {
  function uriOf(value: unknown): string {
    if (
      typeof value === "object" &&
      value !== null &&
      "uri" in value &&
      typeof value.uri === "string"
    ) {
      return value.uri;
    }
    return String(value);
  }

  class MockDirectory {
    readonly uri: string;

    constructor(base: unknown, ...parts: unknown[]) {
      const root = uriOf(base).replace(/\/+$/, "");
      const suffix = parts.map(String).join("/");
      this.uri = `${root}${suffix.length > 0 ? `/${suffix}` : ""}/`;
    }

    get exists(): boolean {
      return mockFsState.directories.has(this.uri);
    }

    create(): void {
      mockFsState.createCalls.push(this.uri);
      mockFsState.directories.add(this.uri);
    }

    delete(): void {
      mockFsState.deleteCalls.push(this.uri);
      mockFsState.directories.delete(this.uri);
      for (const uri of mockFsState.files.keys()) {
        if (uri.startsWith(this.uri)) mockFsState.files.delete(uri);
      }
    }
  }

  class MockFile {
    readonly uri: string;

    constructor(base: unknown, ...parts: unknown[]) {
      if (parts.length === 0 && typeof base === "string") {
        this.uri = base;
      } else {
        this.uri = `${uriOf(base).replace(/\/+$/, "")}/${parts.map(String).join("/")}`;
      }
    }

    get exists(): boolean {
      return mockFsState.files.has(this.uri);
    }

    get size(): number {
      return mockFsState.files.get(this.uri) ?? 0;
    }

    async copy(destination: MockFile): Promise<void> {
      mockFsState.copyCalls.push({
        destination: destination.uri,
        source: this.uri,
      });
      const sourceSize = mockFsState.files.get(this.uri) ?? 0;
      if (mockFsState.copyShouldFail) {
        mockFsState.files.set(destination.uri, Math.max(sourceSize, 1));
        throw new Error("synthetic copy failure");
      }
      mockFsState.files.set(
        destination.uri,
        mockFsState.copiedSize ?? sourceSize,
      );
    }

    delete(): void {
      mockFsState.deleteCalls.push(this.uri);
      mockFsState.files.delete(this.uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: { uri: "file:///cache/" } },
  };
});

const STAGING_DIRECTORY = "file:///cache/media-staging/";

describe("M11 app-owned staging directory", () => {
  beforeEach(() => {
    mockFsState.copiedSize = null;
    mockFsState.copyCalls.length = 0;
    mockFsState.copyShouldFail = false;
    mockFsState.createCalls.length = 0;
    mockFsState.deleteCalls.length = 0;
    mockFsState.directories.clear();
    mockFsState.files.clear();
    mockFsState.uuidCounter = 0;
  });

  test("stages a verified unique copy and preserves the picker source", async () => {
    const source = "file:///picked/original.jpg";
    mockFsState.files.set(source, 12_345);

    const first = await stageOwnedCopy({
      sourceUri: source,
      suggestedName: "original.jpg",
    });
    const second = await stageOwnedCopy({
      sourceUri: source,
      suggestedName: "original.jpg",
    });

    expect(first).toEqual({ uri: expect.any(String), byteSize: 12_345 });
    expect(first.uri).not.toBe(second.uri);
    expect(first.uri).toContain("original.jpg");
    expect(isOwnedStagedFile(first.uri)).toBe(true);
    expect(mockFsState.files.get(source)).toBe(12_345);
    expect(mockFsState.copyCalls.map(({ source: uri }) => uri)).toEqual([
      source,
      source,
    ]);
  });

  test("rejects empty and over-cap sources before directory creation or copy", async () => {
    const empty = "file:///picked/empty.jpg";
    const overCap = "file:///picked/too-large.mp4";
    mockFsState.files.set(empty, 0);
    mockFsState.files.set(overCap, MAX_VIDEO_BYTES + 1);

    await expect(
      stageOwnedCopy({ sourceUri: empty, suggestedName: "empty.jpg" }),
    ).rejects.toThrow(/empty/i);
    await expect(
      stageOwnedCopy({ sourceUri: overCap, suggestedName: "large.mp4" }),
    ).rejects.toThrow(/maximum|size/i);

    expect(mockFsState.createCalls).toEqual([]);
    expect(mockFsState.copyCalls).toEqual([]);
    expect(mockFsState.files.get(empty)).toBe(0);
    expect(mockFsState.files.get(overCap)).toBe(MAX_VIDEO_BYTES + 1);
  });

  test("cleans a partial owned output when copy or re-stat validation fails", async () => {
    const source = "file:///picked/source.png";
    mockFsState.files.set(source, 100);
    mockFsState.copyShouldFail = true;

    await expect(
      stageOwnedCopy({ sourceUri: source, suggestedName: "source.png" }),
    ).rejects.toThrow(/synthetic copy failure/i);
    const failedDestination = mockFsState.copyCalls[0]?.destination;
    expect(failedDestination).toBeDefined();
    expect(mockFsState.files.has(failedDestination as string)).toBe(false);
    expect(mockFsState.files.get(source)).toBe(100);

    mockFsState.copyShouldFail = false;
    mockFsState.copiedSize = 99;
    await expect(
      stageOwnedCopy({ sourceUri: source, suggestedName: "source.png" }),
    ).rejects.toThrow(/size.*match/i);
    const mismatchedDestination = mockFsState.copyCalls[1]?.destination;
    expect(mockFsState.files.has(mismatchedDestination as string)).toBe(false);
    expect(mockFsState.files.get(source)).toBe(100);
  });

  test("deletes only canonical direct children of the owned staging directory", async () => {
    const source = "file:///picked/source.jpg";
    mockFsState.files.set(source, 42);
    const staged = await stageOwnedCopy({
      sourceUri: source,
      suggestedName: "source.jpg",
    });
    const refused = [
      source,
      "file:///cache/media-staging-elsewhere/source.jpg",
      `${STAGING_DIRECTORY}nested/source.jpg`,
      `${STAGING_DIRECTORY}../source.jpg`,
      `${STAGING_DIRECTORY}%2e%2e%2fsource.jpg`,
      `${staged.uri}?query=1`,
      `${staged.uri}#fragment`,
    ];
    for (const uri of refused) {
      mockFsState.files.set(uri, mockFsState.files.get(uri) ?? 42);
      expect(isOwnedStagedFile(uri)).toBe(false);
      removeStagedFile(uri);
      expect(mockFsState.files.has(uri)).toBe(true);
    }

    expect(isOwnedStagedFile(staged.uri)).toBe(true);
    removeStagedFile(staged.uri);
    expect(mockFsState.files.has(staged.uri)).toBe(false);
    expect(mockFsState.files.get(source)).toBe(42);

    await createNativeMediaFileCleanupPort().deleteIfExists(source);
    expect(mockFsState.files.get(source)).toBe(42);
  });

  test("sanitizes names and startup sweep does not create a missing directory", async () => {
    cleanupAllStagedFiles();
    expect(mockFsState.createCalls).toEqual([]);
    expect(mockFsState.deleteCalls).toEqual([]);

    const source = "file:///picked/x";
    mockFsState.files.set(source, 1);
    const staged = await stageOwnedCopy({
      sourceUri: source,
      suggestedName: "../../etc/\u0000passwd",
    });
    expect(staged.uri).not.toContain("..");
    expect(staged.uri).not.toContain("\u0000");

    cleanupAllStagedFiles();
    expect(mockFsState.deleteCalls).toContain(STAGING_DIRECTORY);
    expect(mockFsState.directories.has(STAGING_DIRECTORY)).toBe(false);
    expect(mockFsState.files.get(source)).toBe(1);
  });

  test("allocateStagingDestination reserves an owned path that does not exist yet", () => {
    const destination = allocateStagingDestination({ filename: "thumb.jpg" });
    expect(isOwnedStagedFile(destination.uri)).toBe(true);
    expect(destination.uri).toContain("thumb.jpg");
    expect(destination.exists).toBe(false);
  });

  test("retainStagedFile defers removal until the last holder releases", () => {
    const destination = allocateStagingDestination({ filename: "thumb.jpg" });
    mockFsState.files.set(destination.uri, 10);
    const releaseA = retainStagedFile(destination.uri);
    const releaseB = retainStagedFile(destination.uri);
    removeStagedFile(destination.uri);
    expect(mockFsState.files.has(destination.uri)).toBe(true);
    releaseA();
    expect(mockFsState.files.has(destination.uri)).toBe(true);
    releaseB();
    expect(mockFsState.files.has(destination.uri)).toBe(false);
  });

  test("retainStagedFile rejects a non-owned uri", () => {
    expect(() => retainStagedFile("file:///picked/original.jpg")).toThrow(
      "invalid_staged_file",
    );
  });
});
