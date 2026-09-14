import { pickImageOrVideo } from "@/features/media/platform/image-video-picker";
import { Platform } from "react-native";
const mockPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockLaunch = jest.fn();
const mockNormalize = jest.fn();
const mockDelete = jest.fn();
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  Directory: class {
    uri: string;
    constructor(parent: string, name: string) {
      this.uri = `${parent}/${name}`;
    }
  },
  File: class {
    exists = true;
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      mockDelete(this.uri);
    }
  },
}));
jest.mock(
  "@/features/media/platform/media-image-normalizer",
  () => ({
    normalizePickedImage: (...args: unknown[]) => mockNormalize(...args),
  }),
  { virtual: true },
);
jest.mock("expo-image-picker", () => ({
  getMediaLibraryPermissionsAsync: () => mockPermission(),
  requestMediaLibraryPermissionsAsync: () => mockRequestPermission(),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunch(...args),
  UIImagePickerPreferredAssetRepresentationMode: {
    Current: "current",
    Compatible: "compatible",
  },
  VideoExportPreset: { Passthrough: 0, H264_1920x1080: 7 },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockLaunch.mockReset();
  mockNormalize.mockReset().mockImplementation(async (asset) => ({ asset }));
  jest.replaceProperty(Platform, "OS", "ios");
});
afterEach(() => jest.restoreAllMocks());
test("iOS system picker requests compatible images and native H264/AAC MP4 export without blanket permission", async () => {
  mockLaunch.mockResolvedValue({ canceled: true, assets: null });
  await expect(pickImageOrVideo()).resolves.toEqual({ status: "cancelled" });
  expect(mockPermission).not.toHaveBeenCalled();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(mockLaunch).toHaveBeenCalledWith(
    expect.objectContaining({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      preferredAssetRepresentationMode: "compatible",
      videoExportPreset: 7,
    }),
  );
});
test("topic images use the actual JPEG conversion result and expose temporary-file cleanup", async () => {
  const release = jest.fn();
  mockNormalize.mockResolvedValue({
    asset: {
      uri: "file:///converted.jpg",
      mimeType: "image/jpeg",
      fileName: "a.jpg",
      fileSize: 321,
      width: 2,
      height: 1,
      durationMs: null,
    },
    release,
  });
  mockLaunch.mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: "file:///a.heic",
        mimeType: "image/heic",
        fileName: "a.heic",
        width: 1,
        height: 2,
      },
    ],
  });
  await expect(pickImageOrVideo(true)).resolves.toMatchObject({
    status: "picked",
    asset: {
      uri: "file:///converted.jpg",
      mimeType: "image/jpeg",
      fileName: "a.jpg",
      fileSize: 321,
      width: 2,
      height: 1,
    },
    release,
  });
  expect(mockNormalize).toHaveBeenCalledWith(
    expect.objectContaining({ mimeType: "image/heic", uri: "file:///a.heic" }),
  );
  expect(release).not.toHaveBeenCalled();
  expect(mockLaunch.mock.calls[0][0].mediaTypes).toEqual(["images"]);
});
test("Android keeps its existing picker settings and also normalizes unsupported images", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  mockLaunch.mockResolvedValue({
    canceled: false,
    assets: [
      { uri: "file:///a.heic", mimeType: "image/heic", width: 1, height: 2 },
    ],
  });
  await pickImageOrVideo();
  expect(mockLaunch).toHaveBeenCalledWith(
    expect.objectContaining({
      preferredAssetRepresentationMode: "current",
      videoExportPreset: 0,
    }),
  );
  expect(mockNormalize).toHaveBeenCalledWith(
    expect.objectContaining({ mimeType: "image/heic" }),
  );
});
test("a failed native conversion is not relabeled as a photo permission denial", async () => {
  mockLaunch.mockResolvedValue({
    canceled: false,
    assets: [
      { uri: "file:///a.heic", mimeType: "image/heic", width: 1, height: 2 },
    ],
  });
  mockNormalize.mockRejectedValue(new Error("conversion failed"));
  await expect(pickImageOrVideo()).rejects.toThrow("conversion failed");
  expect(mockPermission).not.toHaveBeenCalled();
});
test("denied access to an original iOS video produces permission feedback without re-prompt", async () => {
  mockLaunch.mockRejectedValue(new Error("native permission denial"));
  mockPermission.mockResolvedValue({ granted: false, canAskAgain: false });
  await expect(pickImageOrVideo()).resolves.toEqual({
    status: "permission_denied",
    canAskAgain: false,
  });
  expect(mockRequestPermission).not.toHaveBeenCalled();
});
test("unrelated native errors are not mislabeled as permission denial", async () => {
  mockLaunch.mockRejectedValue(new Error("unavailable"));
  mockPermission.mockResolvedValue({ granted: true });
  await expect(pickImageOrVideo()).rejects.toThrow("unavailable");
});

test("iOS MP4 export uses returned metadata and deletes only its own exported cache file", async () => {
  const uri =
    "file:///cache/ImagePicker/11111111-1111-4111-8111-111111111111.mp4";
  mockLaunch.mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri,
        type: "video",
        mimeType: "video/mp4",
        fileName: "clip.mp4",
        width: 1080,
        height: 1920,
        duration: 2000,
        fileSize: 321,
      },
    ],
  });
  const result = await pickImageOrVideo();
  expect(result).toMatchObject({
    status: "picked",
    asset: {
      uri,
      mimeType: "video/mp4",
      width: 1080,
      height: 1920,
      durationMs: 2000,
      fileSize: 321,
    },
  });
  expect(mockDelete).not.toHaveBeenCalled();
  if (result.status === "picked") result.release?.();
  expect(mockDelete).toHaveBeenCalledWith(uri);
});
test.each([
  "file:///photos/original.mov",
  "file:///cache/ImagePicker/../original.mp4",
])(
  "an unexpected video destination is rejected, never deleted: %s",
  async (uri) => {
    mockLaunch.mockResolvedValue({
      canceled: false,
      assets: [{ uri, type: "video", mimeType: "video/mp4" }],
    });
    await expect(pickImageOrVideo()).rejects.toThrow(
      "invalid_video_export_destination",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  },
);
test("native export failures are not permission errors even without blanket library access", async () => {
  const error = Object.assign(new Error("native export failed"), {
    code: "ERR_FAILED_TO_TRANSCODE_VIDEO",
  });
  mockLaunch.mockRejectedValue(error);
  mockPermission.mockResolvedValue({ granted: false });
  await expect(pickImageOrVideo()).rejects.toBe(error);
  expect(mockPermission).not.toHaveBeenCalled();
});
