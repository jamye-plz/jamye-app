import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useChatroomGallery } from "@/features/media/model/use-chatroom-gallery";

const mockListChatroomMedia = jest.fn();

// Both mocks below return the SAME object reference on every call (like the
// real useMediaRuntime/useMediaAccess, which memoize with useMemo/useState) --
// a fresh object literal per call would give `request`'s useCallback a new
// `runtime`/`access` identity on every render, re-triggering the mount effect
// forever.
jest.mock("@/features/media/model/media-runtime", () => {
  const mockRuntime = { accountKey: "account-1", isCurrent: () => true };
  return {
    useMediaRuntime: () => mockRuntime,
    useMediaGeneration: () => 0,
  };
});

jest.mock("@/features/media/model/use-media-access", () => {
  // Built lazily (once, on first call) rather than eagerly at factory-eval
  // time: jest.mock's transitive require chain runs before this file's own
  // `const mockListChatroomMedia = jest.fn()` assignment executes, so
  // capturing it into an object here at factory-eval time would freeze in
  // its pre-assignment (undefined) value.
  let mockAccess: { listChatroomMedia: typeof mockListChatroomMedia } | null =
    null;
  return {
    useMediaAccess: () => {
      mockAccess ??= { listChatroomMedia: mockListChatroomMedia };
      return mockAccess;
    },
  };
});

function item(id: string) {
  return {
    id,
    mediaUploadId: id,
    contentType: "image/jpeg",
    byteSize: 1,
    width: 10,
    height: 10,
    duration: null,
    filename: null,
    position: 0,
    posterMediaId: null,
    messageId: "message-1",
    messageCreatedAt: "2026-09-10T00:00:00Z",
  };
}

describe("useChatroomGallery (D4/E10)", () => {
  beforeEach(() => {
    mockListChatroomMedia.mockReset();
  });

  test("loads the first page on mount", async () => {
    mockListChatroomMedia.mockResolvedValueOnce({
      items: [item("a")],
      nextCursor: "cursor-1",
    });
    const { result } = await renderHook(() => useChatroomGallery("room-1"));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
    expect(mockListChatroomMedia).toHaveBeenCalledWith(
      "room-1",
      { before: undefined, limit: 30 },
      expect.anything(),
    );
  });

  test("loadMore appends the next page using the previous cursor", async () => {
    mockListChatroomMedia.mockResolvedValueOnce({
      items: [item("a")],
      nextCursor: "cursor-1",
    });
    const { result } = await renderHook(() => useChatroomGallery("room-1"));
    await waitFor(() => expect(result.current.status).toBe("idle"));

    mockListChatroomMedia.mockResolvedValueOnce({
      items: [item("b")],
      nextCursor: null,
    });
    await act(async () => {
      result.current.loadMore();
      await Promise.resolve();
    });
    await waitFor(() => expect(mockListChatroomMedia).toHaveBeenCalledTimes(2));
    // Waits for the appended item specifically (not bare "idle") -- status is
    // already "idle" before this loadMore's deferred setState lands, so
    // asserting on status alone can pass one render too early.
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(
      result.current.items.map((entry: { id: string }) => entry.id),
    ).toEqual(["a", "b"]);
    expect(result.current.status).toBe("idle");
    expect(result.current.hasMore).toBe(false);
    expect(mockListChatroomMedia).toHaveBeenLastCalledWith(
      "room-1",
      { before: "cursor-1", limit: 30 },
      expect.anything(),
    );
  });

  test("ignores a second loadMore while one for the same cursor is already in flight", async () => {
    mockListChatroomMedia.mockResolvedValueOnce({
      items: [item("a")],
      nextCursor: "cursor-1",
    });
    const { result } = await renderHook(() => useChatroomGallery("room-1"));
    await waitFor(() => expect(result.current.status).toBe("idle"));

    let resolveSecondPage: (value: unknown) => void = () => undefined;
    mockListChatroomMedia.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecondPage = resolve;
        }),
    );
    await act(async () => {
      result.current.loadMore();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.status).toBe("loading_more"));
    await act(async () => {
      result.current.loadMore();
      await Promise.resolve();
    });
    await waitFor(() => expect(mockListChatroomMedia).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveSecondPage({ items: [item("b")], nextCursor: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.status).toBe("idle"));
  });

  test("refresh resets the cursor and replaces the item list", async () => {
    mockListChatroomMedia.mockResolvedValueOnce({
      items: [item("a")],
      nextCursor: "cursor-1",
    });
    const { result } = await renderHook(() => useChatroomGallery("room-1"));
    await waitFor(() => expect(result.current.status).toBe("idle"));

    mockListChatroomMedia.mockResolvedValueOnce({
      items: [item("c")],
      nextCursor: null,
    });
    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });
    await waitFor(() => expect(mockListChatroomMedia).toHaveBeenCalledTimes(2));
    // Waits for the replaced item specifically, same reasoning as loadMore's
    // own test above (status alone can already read "idle" one render early).
    await waitFor(() =>
      expect(
        result.current.items.map((entry: { id: string }) => entry.id),
      ).toEqual(["c"]),
    );
    expect(result.current.status).toBe("idle");
    expect(mockListChatroomMedia).toHaveBeenLastCalledWith(
      "room-1",
      { before: undefined, limit: 30 },
      expect.anything(),
    );
  });

  test("surfaces an error status with a Korean message when the request rejects", async () => {
    mockListChatroomMedia.mockRejectedValueOnce(new Error("network"));
    const { result } = await renderHook(() => useChatroomGallery("room-1"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorMessage).toBe("갤러리를 불러오지 못했습니다.");
  });
});
