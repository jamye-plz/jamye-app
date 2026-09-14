import {
  allocateDownloadDestination,
  cleanupAllDownloadedFiles,
  isOwnedDownloadFile,
  removeDownloadedFile,
  retainDownloadedFile,
} from "@/features/media/platform/media-downloads";

const mockDownloadFsState = {
  createCalls: [] as string[],
  deleteCalls: [] as string[],
  directories: new Set<string>(),
  files: new Set<string>(),
  uuidCounter: 0,
};

jest.mock("expo-crypto", () => ({
  randomUUID: () => `download-uuid-${++mockDownloadFsState.uuidCounter}`,
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
      return mockDownloadFsState.directories.has(this.uri);
    }

    create(): void {
      mockDownloadFsState.createCalls.push(this.uri);
      mockDownloadFsState.directories.add(this.uri);
    }

    delete(): void {
      mockDownloadFsState.deleteCalls.push(this.uri);
      mockDownloadFsState.directories.delete(this.uri);
      for (const uri of mockDownloadFsState.files) {
        if (uri.startsWith(this.uri)) mockDownloadFsState.files.delete(uri);
      }
    }

    list(): MockFile[] {
      return [...mockDownloadFsState.files]
        .filter((uri) => uri.startsWith(this.uri))
        .map((uri) => new MockFile(uri));
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
      return mockDownloadFsState.files.has(this.uri);
    }

    delete(): void {
      mockDownloadFsState.deleteCalls.push(this.uri);
      mockDownloadFsState.files.delete(this.uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: { uri: "file:///cache/" } },
  };
});

const DOWNLOADS_DIRECTORY = "file:///cache/media-downloads/";

describe("M11 app-owned media downloads", () => {
  beforeEach(() => {
    mockDownloadFsState.createCalls.length = 0;
    mockDownloadFsState.deleteCalls.length = 0;
    mockDownloadFsState.directories.clear();
    mockDownloadFsState.files.clear();
    mockDownloadFsState.uuidCounter = 0;
  });

  test("allocates a unique canonical destination for every operation", () => {
    const input = { mediaId: "canonical-media", filename: "photo.png" };
    const first = allocateDownloadDestination(input);
    const second = allocateDownloadDestination(input);

    expect(first.uri).not.toBe(second.uri);
    expect(first.uri).toContain("canonical-media-photo.png");
    expect(isOwnedDownloadFile(first.uri)).toBe(true);
    expect(isOwnedDownloadFile(second.uri)).toBe(true);
    expect(mockDownloadFsState.createCalls).toEqual([DOWNLOADS_DIRECTORY]);
  });

  test("deletes only canonical direct children of the owned downloads directory", () => {
    const destination = allocateDownloadDestination({
      mediaId: "media-id",
      filename: "clip.mp4",
    });
    mockDownloadFsState.files.add(destination.uri);
    const refused = [
      "file:///picked/source.mp4",
      "file:///cache/media-downloads-other/source.mp4",
      `${DOWNLOADS_DIRECTORY}nested/source.mp4`,
      `${DOWNLOADS_DIRECTORY}../source.mp4`,
      `${DOWNLOADS_DIRECTORY}%2e%2e%2fsource.mp4`,
      `${destination.uri}?query=1`,
      `${destination.uri}#fragment`,
    ];
    for (const uri of refused) {
      mockDownloadFsState.files.add(uri);
      expect(isOwnedDownloadFile(uri)).toBe(false);
      removeDownloadedFile(uri);
      expect(mockDownloadFsState.files.has(uri)).toBe(true);
    }

    removeDownloadedFile(destination.uri);
    expect(mockDownloadFsState.files.has(destination.uri)).toBe(false);
  });

  test("sanitizes untrusted names without weakening direct-child ownership", () => {
    const destination = allocateDownloadDestination({
      mediaId: "../media/id",
      filename: "../../etc/\u0000passwd",
    });

    expect(destination.uri).not.toContain("..");
    expect(destination.uri).not.toContain("\u0000");
    expect(isOwnedDownloadFile(destination.uri)).toBe(true);
  });

  test("startup sweep targets only the exact existing owned directory", () => {
    cleanupAllDownloadedFiles();
    expect(mockDownloadFsState.createCalls).toEqual([]);
    expect(mockDownloadFsState.deleteCalls).toEqual([]);

    mockDownloadFsState.directories.add(DOWNLOADS_DIRECTORY);
    mockDownloadFsState.directories.add("file:///cache/media-downloads-other/");
    mockDownloadFsState.files.add(`${DOWNLOADS_DIRECTORY}owned.bin`);
    mockDownloadFsState.files.add(
      "file:///cache/media-downloads-other/preserved.bin",
    );
    cleanupAllDownloadedFiles();

    expect(mockDownloadFsState.deleteCalls).toEqual([DOWNLOADS_DIRECTORY]);
    expect(
      mockDownloadFsState.directories.has(
        "file:///cache/media-downloads-other/",
      ),
    ).toBe(true);
    expect(
      mockDownloadFsState.files.has(
        "file:///cache/media-downloads-other/preserved.bin",
      ),
    ).toBe(true);
  });

  test("account/startup sweeps retain a pending OS handoff but remove other old downloads", () => {
    const kept = allocateDownloadDestination({
      mediaId: "m1",
      filename: "a.mp4",
    });
    const stale = allocateDownloadDestination({
      mediaId: "m2",
      filename: "b.jpg",
    });
    mockDownloadFsState.files.add(kept.uri);
    mockDownloadFsState.files.add(stale.uri);
    const release = retainDownloadedFile(kept.uri);
    const releaseSecond = retainDownloadedFile(kept.uri);
    cleanupAllDownloadedFiles();
    cleanupAllDownloadedFiles();
    removeDownloadedFile(kept.uri);
    expect(mockDownloadFsState.files.has(kept.uri)).toBe(true);
    expect(mockDownloadFsState.files.has(stale.uri)).toBe(false);
    release();
    release();
    removeDownloadedFile(kept.uri);
    expect(mockDownloadFsState.files.has(kept.uri)).toBe(true);
    releaseSecond();
    // Deletion requested while a native consumer held the file is deferred,
    // not lost: releasing the last owner completes cleanup without another sweep.
    expect(mockDownloadFsState.files.has(kept.uri)).toBe(false);
    removeDownloadedFile(kept.uri);
    expect(mockDownloadFsState.files.has(kept.uri)).toBe(false);
    cleanupAllDownloadedFiles();
    expect(mockDownloadFsState.directories.has(DOWNLOADS_DIRECTORY)).toBe(
      false,
    );
    expect(() => retainDownloadedFile("file:///user/source.mp4")).toThrow(
      "invalid_download_file",
    );
  });
});
