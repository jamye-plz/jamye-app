import { shareOrSaveLocalFile } from "@/features/media/platform/media-share";

const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockRelease = jest.fn();
const mockRetain = jest.fn<() => void, [string]>(() => mockRelease);

jest.mock("@/features/media/platform/media-downloads", () => ({
  retainDownloadedFile: (uri: string) => mockRetain(uri),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

describe("M11 OS open/save handoff", () => {
  beforeEach(() => {
    mockIsAvailableAsync.mockReset();
    mockShareAsync.mockReset();
    mockRelease.mockClear();
    mockRetain.mockClear();
  });

  test("reports unavailable without attempting to share", async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    await expect(
      shareOrSaveLocalFile("file:///a.mp4", "video/mp4"),
    ).resolves.toEqual({ status: "unavailable" });
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  test("shares the local file with its MIME type", async () => {
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockResolvedValue(undefined);
    await expect(
      shareOrSaveLocalFile("file:///a.mp4", "video/mp4"),
    ).resolves.toEqual({ status: "shared" });
    expect(mockShareAsync).toHaveBeenCalledWith(
      "file:///a.mp4",
      expect.objectContaining({ mimeType: "video/mp4" }),
    );
  });

  test("distinguishes a user cancellation from a real failure", async () => {
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockRejectedValue(
      new Error("User cancelled the share sheet"),
    );
    await expect(
      shareOrSaveLocalFile("file:///a.mp4", "video/mp4"),
    ).resolves.toEqual({ status: "cancelled" });
  });

  test("propagates a genuine share failure", async () => {
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockRejectedValue(new Error("native module crashed"));
    await expect(
      shareOrSaveLocalFile("file:///a.mp4", "video/mp4"),
    ).rejects.toThrow("native module crashed");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test("account cancellation during availability check never opens a stale share sheet", async () => {
    let finish!: (value: boolean) => void;
    mockIsAvailableAsync.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const controller = new AbortController();
    const pending = shareOrSaveLocalFile(
      "file:///owned/a.mp4",
      "video/mp4",
      controller.signal,
    );
    expect(mockRetain).toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    controller.abort();
    finish(true);
    await expect(pending).resolves.toEqual({ status: "cancelled" });
    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test("already cancelled operations never retain or open a file", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      shareOrSaveLocalFile("file:///owned/a.mp4", null, controller.signal),
    ).resolves.toEqual({ status: "cancelled" });
    expect(mockRetain).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
});
