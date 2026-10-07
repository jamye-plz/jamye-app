import { pickAvatarPhoto } from "@/features/account/platform/avatar-photo";

// AV-AC2: expo-image-picker (one image, system 1:1 crop) -> always
// center-crop square -> 512px JPEG q0.85 via expo-image-manipulator (strips
// EXIF) -> reject > 1 MiB -> stage for the native PUT; every temp file is
// deleted on every path.
const PICKED =
  "file:///cache/ImagePicker/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.jpg";
const RENDERED =
  "file:///cache/ImageManipulator/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.jpg";
const STAGED = "file:///cache/media-staging/cccccccc-avatar.jpg";

const mockLaunch = jest.fn();
const mockGetPermission = jest.fn();
const mockManipulate = jest.fn();
const mockRender = jest.fn();
const mockSave = jest.fn();
const mockCrop = jest.fn();
const mockResize = jest.fn();
const mockContextRelease = jest.fn();
const mockImageRelease = jest.fn();
const mockStage = jest.fn();
const mockRemoveStaged = jest.fn();
const mockDelete = jest.fn();
const mockFiles = new Map<string, { size: number }>();

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunch(...args),
  getMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockGetPermission(...args),
}));
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
  },
}));
jest.mock("expo", () => ({
  requireNativeModule: (name: string) => {
    if (name !== "ExpoImageManipulator") throw new Error("wrong native module");
    return { manipulate: (...args: unknown[]) => mockManipulate(...args) };
  },
}));
jest.mock("@/features/media/platform/media-staging", () => ({
  stageOwnedCopy: (...args: unknown[]) => mockStage(...args),
  removeStagedFile: (...args: unknown[]) => mockRemoveStaged(...args),
}));

function picked(width: number, height: number, uri = PICKED) {
  return {
    canceled: false,
    assets: [{ uri, width, height, type: "image", mimeType: "image/jpeg" }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockFiles.set(PICKED, { size: 900_000 });
  mockFiles.set(RENDERED, { size: 48_000 });
  mockLaunch.mockReset().mockResolvedValue(picked(1000, 600));
  mockGetPermission.mockReset().mockResolvedValue({ granted: true });
  const context = {
    crop: mockCrop,
    resize: mockResize,
    renderAsync: mockRender,
    release: mockContextRelease,
  };
  mockCrop.mockReset().mockReturnValue(context);
  mockResize.mockReset().mockReturnValue(context);
  mockSave
    .mockReset()
    .mockResolvedValue({ uri: RENDERED, width: 512, height: 512 });
  mockRender
    .mockReset()
    .mockResolvedValue({ saveAsync: mockSave, release: mockImageRelease });
  mockManipulate.mockReset().mockReturnValue(context);
  mockStage.mockReset().mockResolvedValue({ uri: STAGED, byteSize: 48_000 });
});

describe("pickAvatarPhoto (AV-AC2)", () => {
  test("opens the library for exactly one image with the system 1:1 editor", async () => {
    await pickAvatarPhoto();
    expect(mockLaunch).toHaveBeenCalledTimes(1);
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        allowsMultipleSelection: false,
        exif: false,
      }),
    );
  });

  test("center-crops a landscape pick to a square, resizes to 512px and saves a q0.85 JPEG", async () => {
    const result = await pickAvatarPhoto();
    expect(mockManipulate).toHaveBeenCalledWith(PICKED);
    expect(mockCrop).toHaveBeenCalledWith({
      originX: 200,
      originY: 0,
      width: 600,
      height: 600,
    });
    expect(mockResize).toHaveBeenCalledWith({ width: 512 });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ format: "jpeg", compress: 0.85 }),
    );
    expect(result).toEqual({
      status: "ready",
      file: { uri: STAGED, byteSize: 48_000 },
      release: expect.any(Function),
    });
  });

  test("center-crops a portrait pick on the vertical axis", async () => {
    mockLaunch.mockResolvedValue(picked(600, 1001));
    await pickAvatarPhoto();
    expect(mockCrop).toHaveBeenCalledWith({
      originX: 0,
      originY: 200,
      width: 600,
      height: 600,
    });
  });

  test("crops even an already-square pick and never upscales a small photo", async () => {
    mockLaunch.mockResolvedValue(picked(300, 300));
    await pickAvatarPhoto();
    expect(mockCrop).toHaveBeenCalledWith({
      originX: 0,
      originY: 0,
      width: 300,
      height: 300,
    });
    expect(mockResize).not.toHaveBeenCalled();
  });

  test("stages the re-encoded JPEG for the native PUT and deletes the picker and manipulator temp files", async () => {
    const result = await pickAvatarPhoto();
    expect(mockStage).toHaveBeenCalledWith({
      sourceUri: RENDERED,
      suggestedName: "avatar.jpg",
    });
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
    expect(mockDelete).toHaveBeenCalledWith(RENDERED);
    expect(mockImageRelease).toHaveBeenCalledTimes(1);
    expect(mockContextRelease).toHaveBeenCalledTimes(1);
    expect(mockRemoveStaged).not.toHaveBeenCalled();
    if (result.status !== "ready") throw new Error("expected ready");
    result.release();
    expect(mockRemoveStaged).toHaveBeenCalledWith(STAGED);
  });

  test("never deletes a picked file outside the picker's own cache directory", async () => {
    const library = "content://media/external/images/media/42";
    mockLaunch.mockResolvedValue(picked(1000, 1000, library));
    await pickAvatarPhoto();
    expect(mockDelete).not.toHaveBeenCalledWith(library);
    expect(mockDelete).toHaveBeenCalledWith(RENDERED);
  });

  test("rejects an output over 1 MiB, stages nothing and deletes every temp file", async () => {
    mockFiles.set(RENDERED, { size: 1_048_577 });
    const result = await pickAvatarPhoto();
    expect(result).toEqual({ status: "too_large", byteSize: 1_048_577 });
    expect(mockStage).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
    expect(mockDelete).toHaveBeenCalledWith(RENDERED);
  });

  test("accepts an output of exactly 1 MiB", async () => {
    mockFiles.set(RENDERED, { size: 1_048_576 });
    mockStage.mockResolvedValue({ uri: STAGED, byteSize: 1_048_576 });
    const result = await pickAvatarPhoto();
    expect(result.status).toBe("ready");
  });

  test("returns cancelled and touches nothing when the user dismisses the picker", async () => {
    mockLaunch.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickAvatarPhoto()).resolves.toEqual({ status: "cancelled" });
    expect(mockManipulate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test("an empty asset list is a cancel", async () => {
    mockLaunch.mockResolvedValue({ canceled: false, assets: [] });
    await expect(pickAvatarPhoto()).resolves.toEqual({ status: "cancelled" });
  });

  test("a permission failure becomes an informative permission_denied state", async () => {
    mockLaunch.mockRejectedValue(
      Object.assign(new Error("denied"), { code: "ERR_MISSING_PERMISSIONS" }),
    );
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(pickAvatarPhoto()).resolves.toEqual({
      status: "permission_denied",
      canAskAgain: false,
    });
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  test("a non-permission picker failure with a granted library is a failed state, not a throw", async () => {
    mockLaunch.mockRejectedValue(new Error("picker exploded"));
    mockGetPermission.mockResolvedValue({ granted: true });
    await expect(pickAvatarPhoto()).resolves.toEqual({ status: "failed" });
  });

  test("a manipulator failure deletes the picker temp file and releases native objects", async () => {
    mockSave.mockRejectedValue(new Error("encode failed"));
    await expect(pickAvatarPhoto()).resolves.toEqual({ status: "failed" });
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
    expect(mockImageRelease).toHaveBeenCalledTimes(1);
    expect(mockContextRelease).toHaveBeenCalledTimes(1);
    expect(mockStage).not.toHaveBeenCalled();
  });

  test("a manipulator failure before any output exists still deletes the picker temp file", async () => {
    mockRender.mockRejectedValue(new Error("decode failed"));
    await expect(pickAvatarPhoto()).resolves.toEqual({ status: "failed" });
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
    expect(mockContextRelease).toHaveBeenCalledTimes(1);
  });

  // VERIFY fix 2: a throwing native release() must not skip the temp-file
  // cleanup, and release errors never turn a result into a throw.
  test("a throwing image release still releases the context and deletes both temp files", async () => {
    mockImageRelease.mockImplementationOnce(() => {
      throw new Error("release failed");
    });
    const result = await pickAvatarPhoto();
    expect(result.status).toBe("ready");
    expect(mockContextRelease).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
    expect(mockDelete).toHaveBeenCalledWith(RENDERED);
  });

  test("a throwing context release still deletes both temp files", async () => {
    mockContextRelease.mockImplementationOnce(() => {
      throw new Error("release failed");
    });
    const result = await pickAvatarPhoto();
    expect(result.status).toBe("ready");
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
    expect(mockDelete).toHaveBeenCalledWith(RENDERED);
  });

  test("both releases throwing on a failed encode still reports failed and deletes the picker temp file", async () => {
    mockSave.mockRejectedValue(new Error("encode failed"));
    mockImageRelease.mockImplementationOnce(() => {
      throw new Error("release failed");
    });
    mockContextRelease.mockImplementationOnce(() => {
      throw new Error("release failed");
    });
    await expect(pickAvatarPhoto()).resolves.toEqual({ status: "failed" });
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
  });

  test("a staging failure deletes the manipulator output and picker temp file and reports failed", async () => {
    mockStage.mockRejectedValue(new Error("copy failed"));
    await expect(pickAvatarPhoto()).resolves.toEqual({ status: "failed" });
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
    expect(mockDelete).toHaveBeenCalledWith(RENDERED);
  });

  test("an empty or missing output is a failure", async () => {
    mockFiles.set(RENDERED, { size: 0 });
    await expect(pickAvatarPhoto()).resolves.toEqual({ status: "failed" });
    expect(mockStage).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
  });

  test("a picker asset with unusable dimensions is a failure before any native work", async () => {
    mockLaunch.mockResolvedValue(picked(0, 0));
    await expect(pickAvatarPhoto()).resolves.toEqual({ status: "failed" });
    expect(mockManipulate).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(PICKED);
  });
});
