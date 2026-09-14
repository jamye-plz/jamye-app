import { normalizePickedImage } from "@/features/media/platform/media-image-normalizer";
import type { PickedMediaAsset } from "@/features/media/platform/image-video-picker";

const input = "file:///photos/original.heic";
const output =
  "file:///cache/ImageManipulator/11111111-1111-4111-8111-111111111111.jpg";
const mockDelete = jest.fn();
const mockClose = jest.fn();
const mockContextRelease = jest.fn();
const mockImageRelease = jest.fn();
const mockSave = jest.fn();
const mockRender = jest.fn();
const mockManipulate = jest.fn();
const mockFiles = new Map<string, { size: number; header: number[] }>();
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  Directory: class {
    uri: string;
    constructor(parent: string, name: string) {
      this.uri = `${parent}/${name}`;
    }
  },
  File: class {
    readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.size ?? 0;
    }
    delete() {
      mockDelete(this.uri);
      mockFiles.delete(this.uri);
    }
    open() {
      return {
        readBytes: (length: number) =>
          new Uint8Array(
            mockFiles.get(this.uri)?.header.slice(0, length) ?? [],
          ),
        close: mockClose,
      };
    }
  },
}));
jest.mock("expo", () => ({
  requireNativeModule: (name: string) => {
    if (name !== "ExpoImageManipulator") throw new Error("wrong native module");
    return { manipulate: (...args: unknown[]) => mockManipulate(...args) };
  },
}));

const asset: PickedMediaAsset = {
  uri: input,
  mimeType: "image/heic",
  fileName: "사진.heic",
  fileSize: 20,
  width: 40,
  height: 30,
  durationMs: null,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockFiles.set(input, { size: 123, header: [0, 0, 0] });
  mockFiles.set(output, { size: 321, header: [0xff, 0xd8, 0xff, 0xe0] });
  mockSave
    .mockReset()
    .mockResolvedValue({ uri: output, width: 30, height: 40 });
  mockRender
    .mockReset()
    .mockResolvedValue({ saveAsync: mockSave, release: mockImageRelease });
  mockManipulate
    .mockReset()
    .mockReturnValue({ renderAsync: mockRender, release: mockContextRelease });
});

test.each([
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  "image/bmp",
  "image/x-ms-bmp",
  "image/jpg",
])(
  "%s uses native JPEG encoding and output metadata, never relabels original bytes",
  async (mimeType) => {
    const result = await normalizePickedImage({ ...asset, mimeType });
    expect(mockManipulate).toHaveBeenCalledWith(input);
    expect(mockSave).toHaveBeenCalledWith({
      format: "jpeg",
      compress: 0.9,
      base64: false,
    });
    expect(result.asset).toEqual({
      ...asset,
      uri: output,
      mimeType: "image/jpeg",
      fileName: "사진.jpg",
      fileSize: 321,
      width: 30,
      height: 40,
    });
    expect(mockImageRelease).toHaveBeenCalledTimes(1);
    expect(mockContextRelease).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
    result.release?.();
    result.release?.();
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(output);
    expect(mockFiles.has(input)).toBe(true);
  },
);
test.each([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
])(
  "%s passes through unchanged for the existing policy gate",
  async (mimeType) => {
    const original = { ...asset, mimeType };
    expect(await normalizePickedImage(original)).toEqual({ asset: original });
    expect(mockManipulate).not.toHaveBeenCalled();
  },
);
test.each([null, "application/octet-stream"])(
  "MIME %s only uses the extension as a hint to DECODE, not as proof of format",
  async (mimeType) => {
    expect(
      (await normalizePickedImage({ ...asset, mimeType })).asset.mimeType,
    ).toBe("image/jpeg");
    mockManipulate.mockClear();
    const unknown = {
      ...asset,
      mimeType: null,
      fileName: "unknown",
      uri: "file:///unknown",
    };
    expect(await normalizePickedImage(unknown)).toEqual({ asset: unknown });
    expect(mockManipulate).not.toHaveBeenCalled();
  },
);
test("missing image names receive a JPEG name only after successful conversion", async () => {
  expect(
    (await normalizePickedImage({ ...asset, fileName: null })).asset.fileName,
  ).toBe("image.jpg");
});
test("content URI input can use the Android native decoder", async () => {
  const uri = "content://media/selected/1";
  mockFiles.set(uri, { size: 123, header: [] });
  expect((await normalizePickedImage({ ...asset, uri })).asset.mimeType).toBe(
    "image/jpeg",
  );
  expect(mockManipulate).toHaveBeenCalledWith(uri);
});
test.each(["https://untrusted.example/a.heic", "data:image/heic;base64,AA=="])(
  "never fetches remote or JS-buffered input: %s",
  async (uri) => {
    await expect(normalizePickedImage({ ...asset, uri })).rejects.toThrow(
      "conversion_requires_local_file",
    );
    expect(mockManipulate).not.toHaveBeenCalled();
  },
);
test.each([0, 50 * 1024 * 1024 + 1])(
  "rejects invalid input size %s before decoding",
  async (size) => {
    mockFiles.set(input, { size, header: [] });
    await expect(normalizePickedImage(asset)).rejects.toThrow(
      "invalid_conversion_input_size",
    );
    expect(mockManipulate).not.toHaveBeenCalled();
  },
);
test("missing inputs do not invoke the native decoder", async () => {
  mockFiles.delete(input);
  await expect(normalizePickedImage(asset)).rejects.toThrow(
    "invalid_conversion_input_size",
  );
});
test.each(["render", "save"])(
  "%s failure releases native memory and never deletes the source",
  async (phase) => {
    (phase === "render" ? mockRender : mockSave).mockRejectedValue(
      new Error("native failure"),
    );
    await expect(normalizePickedImage(asset)).rejects.toThrow("native failure");
    expect(mockContextRelease).toHaveBeenCalledTimes(1);
    expect(mockImageRelease).toHaveBeenCalledTimes(phase === "save" ? 1 : 0);
    expect(mockDelete).not.toHaveBeenCalled();
  },
);
test("a mislabeled JPEG output is rejected by its bytes and cleaned up", async () => {
  mockFiles.set(output, { size: 10, header: [0, 0, 0] });
  await expect(normalizePickedImage(asset)).rejects.toThrow(
    "invalid_converted_jpeg",
  );
  expect(mockClose).toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledWith(output);
  expect(mockFiles.has(input)).toBe(true);
});
test("empty outputs are rejected and cleaned up", async () => {
  mockFiles.set(output, { size: 0, header: [] });
  await expect(normalizePickedImage(asset)).rejects.toThrow(
    "empty_converted_image",
  );
  expect(mockDelete).toHaveBeenCalledWith(output);
});
test.each([
  input,
  "file:///cache/ImageManipulator/../user.jpg",
  "file:///photos/user.jpg",
])(
  "never owns or deletes an invalid conversion destination: %s",
  async (uri) => {
    mockSave.mockResolvedValue({ uri, width: 30, height: 40 });
    await expect(normalizePickedImage(asset)).rejects.toThrow(
      "invalid_conversion_destination",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  },
);
test("cleanup races do not replace a successful result", async () => {
  const result = await normalizePickedImage(asset);
  mockDelete.mockImplementationOnce(() => {
    throw new Error("file raced");
  });
  expect(() => result.release?.()).not.toThrow();
});
