import { pickAudioFile } from "@/features/media/platform/audio-file-picker";

const mockGetDocumentAsync = jest.fn();

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

describe("M11 audio document picker", () => {
  beforeEach(() => {
    mockGetDocumentAsync.mockReset();
  });

  test("filters by the supported audio MIME types and copies to cache", async () => {
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await pickAudioFile();
    expect(mockGetDocumentAsync).toHaveBeenCalledWith({
      type: ["audio/webm", "audio/mp4", "audio/ogg"],
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  test("reports cancellation without a fabricated asset", async () => {
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickAudioFile()).resolves.toEqual({ status: "cancelled" });
  });

  test("returns the picked audio asset", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///voice.ogg",
          mimeType: "audio/ogg",
          name: "voice.ogg",
          size: 4096,
          lastModified: 0,
        },
      ],
    });
    await expect(pickAudioFile()).resolves.toEqual({
      status: "picked",
      asset: {
        uri: "file:///voice.ogg",
        mimeType: "audio/ogg",
        fileName: "voice.ogg",
        fileSize: 4096,
      },
    });
  });
});
