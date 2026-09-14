import { putNativeFile } from "@/features/media/platform/native-file-put";

const mockPut = jest.fn();
const mockCancel = jest.fn();
jest.mock("expo", () => ({
  requireNativeModule: (name: string) => {
    expect(name).toBe("JamyeFilePut");
    return { putAsync: mockPut, cancelAsync: mockCancel };
  },
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "upload-id" }));
const input = {
  url: "https://media.example/a?proof=a%2Bb%2F%3D&x=1&x=2",
  uri: "file:///cache/media-staging/a.bin",
  contentType: "image/jpeg",
  byteSize: 50 * 1024 * 1024,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockPut.mockReset();
  mockCancel.mockResolvedValue(undefined);
});
test("bridge sends metadata only, independent of filename MIME and payload size", async () => {
  mockPut.mockResolvedValue({ status: 200 });
  await expect(
    putNativeFile({ ...input, signal: new AbortController().signal }),
  ).resolves.toEqual({ status: 200 });
  expect(mockPut).toHaveBeenCalledWith(
    "upload-id",
    input.url,
    input.uri,
    "image/jpeg",
    input.byteSize,
  );
  expect(mockCancel).not.toHaveBeenCalled();
});
test.each([200, 307, 403, 500])(
  "returns %s unchanged, without redirects or retry in JS",
  async (status) => {
    mockPut.mockResolvedValue({ status });
    await expect(
      putNativeFile({ ...input, signal: new AbortController().signal }),
    ).resolves.toEqual({ status });
    expect(mockPut).toHaveBeenCalledTimes(1);
  },
);
test.each([false, true])(
  "cancels the registered request, or rejects before entry (%s)",
  async (before) => {
    let finish!: (value: unknown) => void;
    mockPut.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    if (before) controller.abort();
    const pending = putNativeFile({ ...input, signal: controller.signal });
    if (before) {
      await expect(pending).rejects.toThrow("cancelled");
      expect(mockPut).not.toHaveBeenCalled();
      expect(mockCancel).not.toHaveBeenCalled();
      return;
    }
    if (!before) controller.abort();
    expect(mockPut.mock.invocationCallOrder[0]).toBeLessThan(
      mockCancel.mock.invocationCallOrder[0],
    );
    expect(mockCancel).toHaveBeenCalledWith("upload-id");
    finish({ status: 200 });
    await pending;
  },
);
test.each(["resolve", "reject"])(
  "removes abort listener after native %s",
  async (mode) => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, "removeEventListener");
    if (mode === "resolve") mockPut.mockResolvedValue({ status: 200 });
    else mockPut.mockRejectedValue(new Error("network"));
    await putNativeFile({ ...input, signal: controller.signal }).catch(
      () => undefined,
    );
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    expect(mockCancel).not.toHaveBeenCalled();
  },
);
test("cancellation transport rejection cannot replace upload result or become unhandled", async () => {
  mockCancel.mockRejectedValue(new Error("module destroyed"));
  mockPut.mockRejectedValue(new Error("cancelled"));
  const controller = new AbortController();
  const pending = putNativeFile({ ...input, signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toThrow("cancelled");
});
