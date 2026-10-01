import { act, renderHook } from "@testing-library/react-native";
import { useMediaSharing } from "@/features/media/model/media-sharing";

let mockFocused = true;
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) => {
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(
        () => (mockFocused ? callback() : undefined),
        [callback, mockFocused],
      );
  },
}));

const mockGetAccessUrl = jest.fn();
jest.mock("@/features/media/model/use-media-access", () => ({
  useMediaAccess: () => ({
    getAccessUrl: (...args: unknown[]) => mockGetAccessUrl(...args),
    getDownloadLocation: jest.fn(),
    listChatroomMedia: jest.fn(),
  }),
}));

let mockRuntimeCurrent = true;
jest.mock("@/features/media/model/media-runtime", () => ({
  useMediaRuntime: () => ({
    accountKey: "account-one",
    isCurrent: () => mockRuntimeCurrent,
    subscribeInvalidation: () => () => {},
  }),
  useMediaGeneration: () => 0,
}));

const mockAllocate = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/features/media/platform/media-downloads", () => ({
  allocateDownloadDestination: (...args: unknown[]) => mockAllocate(...args),
  removeDownloadedFile: (uri: string) => mockRemove(uri),
}));

const mockDownload = jest.fn();
jest.mock("@/features/media/platform/media-object-transfer", () => ({
  downloadToFile: (...args: unknown[]) => mockDownload(...args),
}));

const mockShare = jest.fn();
jest.mock("@/features/media/platform/media-share", () => ({
  shareOrSaveLocalFile: (...args: unknown[]) => mockShare(...args),
}));

const attachment = { id: "media-1", filename: "photo.jpg", type: "image/jpeg" };

beforeEach(() => {
  mockFocused = true;
  mockRuntimeCurrent = true;
  mockGetAccessUrl.mockReset().mockResolvedValue({
    url: "https://media.example/signed",
    byteSize: 10,
  });
  mockAllocate.mockReset().mockReturnValue({ uri: "file:///tmp/photo.jpg" });
  mockRemove.mockReset();
  mockDownload.mockReset().mockResolvedValue(undefined);
  mockShare.mockReset().mockResolvedValue({ status: "shared" });
});

test("shares an attachment: download then hand off to the share sheet, then cleans up the temp file", async () => {
  const { result } = await renderHook(() => useMediaSharing());
  await act(async () => {
    await result.current.shareAttachment(attachment);
  });
  expect(mockGetAccessUrl).toHaveBeenCalledWith("media-1", expect.anything());
  expect(mockDownload).toHaveBeenCalledWith(
    expect.objectContaining({ url: "https://media.example/signed" }),
  );
  expect(mockShare).toHaveBeenCalledWith(
    "file:///tmp/photo.jpg",
    "image/jpeg",
    expect.anything(),
  );
  expect(mockRemove).toHaveBeenCalledWith("file:///tmp/photo.jpg");
  expect(result.current.status).toBe("idle");
  expect(result.current.busy).toBe(false);
});

test("a second concurrent call is ignored while a share is already in flight", async () => {
  let resolveDownload: () => void = () => {};
  mockDownload.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveDownload = resolve;
    }),
  );
  const { result } = await renderHook(() => useMediaSharing());
  let firstDone: Promise<void> | undefined;
  await act(async () => {
    firstDone = result.current.shareAttachment(attachment);
    await result.current.shareAttachment(attachment);
  });
  expect(mockGetAccessUrl).toHaveBeenCalledTimes(1);
  resolveDownload();
  await act(async () => {
    await firstDone;
  });
});

test("surfaces an error and clears the temp file when the download fails", async () => {
  mockDownload.mockRejectedValue(new Error("network"));
  const { result } = await renderHook(() => useMediaSharing());
  await act(async () => {
    await result.current.shareAttachment(attachment);
  });
  expect(result.current.status).toBe("error");
  expect(result.current.errorMessage).toBe(
    "파일을 공유하지 못했습니다. 다시 시도해 주세요.",
  );
  expect(mockRemove).toHaveBeenCalledWith("file:///tmp/photo.jpg");
});

test("surfaces the unavailable message when the OS share sheet cannot be used", async () => {
  mockShare.mockResolvedValue({ status: "unavailable" });
  const { result } = await renderHook(() => useMediaSharing());
  await act(async () => {
    await result.current.shareAttachment(attachment);
  });
  expect(result.current.status).toBe("error");
  expect(result.current.errorMessage).toBe(
    "이 기기에서는 파일 공유·저장을 사용할 수 없습니다.",
  );
});

test("does nothing once the screen has blurred", async () => {
  mockFocused = false;
  const { result } = await renderHook(() => useMediaSharing());
  await act(async () => {
    await result.current.shareAttachment(attachment);
  });
  expect(mockGetAccessUrl).not.toHaveBeenCalled();
});
