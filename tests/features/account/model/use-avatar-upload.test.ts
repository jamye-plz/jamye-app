import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { useAvatarUpload } from "@/features/account/model/use-avatar-upload";

// AV-AC3: U4 -> native PUT (image/jpeg) -> U5 -> applyProfile; progress,
// Korean failure reasons with `다시 시도`, duplicate-run blocking, unmount
// abort, and no raw server codes on screen. Clear is U2 "" -> applyProfile.
const mockPrincipal = {
  origin: "https://api.example",
  userId: "11111111-1111-4111-8111-111111111111",
  epoch: 1,
};
const UPLOAD_ID = "44444444-4444-4444-8444-444444444444";
const STAGED = {
  uri: "file:///cache/media-staging/x-avatar.jpg",
  byteSize: 4800,
};

const mockFinalProfile = {
  id: mockPrincipal.userId,
  provider: "kakao",
  nickname: "지민",
  avatarUrl: "https://api.example/api/v1/avatars/new",
  createdAt: "2026-09-16T00:00:00Z",
};
const mockClearedProfile = { ...mockFinalProfile, avatarUrl: null };

const calls: string[] = [];
const mockPick = jest.fn();
const mockRelease = jest.fn();
const mockStart = jest.fn();
const mockFinalize = jest.fn();
const mockUpdateProfile = jest.fn();
const mockPut = jest.fn();
const mockApplyProfile = jest.fn();
let mockProfileAvatar: string | null = "https://api.example/api/v1/avatars/old";

class FakeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

jest.mock("@/features/account/platform/avatar-photo", () => ({
  pickAvatarPhoto: (...args: unknown[]) => mockPick(...args),
}));
jest.mock("@/features/media/platform/media-object-transfer", () => ({
  createNativeMediaObjectPutPort: () => ({
    put: (...args: unknown[]) => mockPut(...args),
  }),
}));
const mockCreateAccountApi = jest.fn();
jest.mock("@/features/account/data/account-api", () => ({
  createAccountApi: (...args: unknown[]) => {
    mockCreateAccountApi(...args);
    return {
      startAvatarUpload: (...startArgs: unknown[]) => mockStart(...startArgs),
      finalizeAvatarUpload: (...finalizeArgs: unknown[]) =>
        mockFinalize(...finalizeArgs),
      updateProfile: (...updateArgs: unknown[]) =>
        mockUpdateProfile(...updateArgs),
    };
  },
}));
jest.mock("@/core/config/public-env", () => ({
  ...jest.requireActual<typeof import("@/core/config/public-env")>(
    "@/core/config/public-env",
  ),
  getPublicEnv: () => ({
    apiOrigin: "https://api.example",
    mediaOrigin: "https://media.example",
  }),
}));
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => ({
    principal: mockPrincipal,
    state: {
      status: "signed-in",
      profile: { ...mockFinalProfile, avatarUrl: mockProfileAvatar },
    },
    applyProfile: (...args: unknown[]) => mockApplyProfile(...args),
    authorizedRequest: (
      execute: (token: string, signal: AbortSignal) => Promise<unknown>,
      signal?: AbortSignal,
    ) => execute("access-token", signal ?? new AbortController().signal),
  }),
}));

function ready() {
  return { status: "ready", file: STAGED, release: mockRelease } as const;
}

const announcements: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  announcements.length = 0;
  jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockImplementation((message: string) => {
      announcements.push(message);
    });
  mockProfileAvatar = "https://api.example/api/v1/avatars/old";
  mockPick.mockReset().mockImplementation(async () => {
    calls.push("pick");
    return ready();
  });
  mockStart.mockReset().mockImplementation(async () => {
    calls.push("start");
    return {
      uploadId: UPLOAD_ID,
      put: { url: "https://storage.example/put?sig=1", expiresIn: 900 },
    };
  });
  mockPut.mockReset().mockImplementation(async () => {
    calls.push("put");
    return { status: 200 };
  });
  mockFinalize.mockReset().mockImplementation(async () => {
    calls.push("finalize");
    return mockFinalProfile;
  });
  mockUpdateProfile.mockReset().mockResolvedValue(mockClearedProfile);
  mockApplyProfile.mockReset().mockImplementation(() => {
    calls.push("apply");
  });
});

async function setup() {
  return renderHook(() => useAvatarUpload());
}

function expectNoRawCode(message: string | undefined) {
  expect(message).toBeTruthy();
  expect(message).toMatch(/[가-힣]/);
  expect(message).not.toMatch(/[a-z]+_[a-z_]+/);
}

afterEach(() => {
  jest.restoreAllMocks();
});

// SHIP fix 1: screen-reader users hear the upload start and each success;
// failures are not announced (the native alert already presents them).
describe("useAvatarUpload screen-reader announcements", () => {
  const STARTED = "프로필 사진을 올리는 중입니다";
  const CHANGED = "프로필 사진을 바꿨습니다";
  const RESET = "기본 이미지로 바꿨습니다";

  test("announces the upload start and then the success, in order around the request", async () => {
    mockStart.mockImplementationOnce(async () => {
      expect(announcements).toEqual([STARTED]);
      return {
        uploadId: UPLOAD_ID,
        put: { url: "https://storage.example/put?sig=1", expiresIn: 900 },
      };
    });
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    expect(announcements).toEqual([STARTED, CHANGED]);
  });

  test("announces nothing for a cancelled pick or a pick failure", async () => {
    mockPick.mockResolvedValueOnce({ status: "cancelled" });
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    mockPick.mockResolvedValueOnce({
      status: "permission_denied",
      canAskAgain: false,
    });
    await act(async () => {
      await result.current.selectPhoto();
    });
    expect(announcements).toEqual([]);
  });

  test.each([
    [
      "U4",
      () =>
        mockStart.mockRejectedValueOnce(
          new FakeApiError(503, "object_storage_degraded"),
        ),
    ],
    ["PUT", () => mockPut.mockResolvedValueOnce({ status: 403 })],
    [
      "U5",
      () =>
        mockFinalize.mockRejectedValueOnce(
          new FakeApiError(422, "avatar_object_invalid"),
        ),
    ],
  ])(
    "a %s failure announces the start but neither a success nor the failure text",
    async (_stage, arrange) => {
      arrange();
      const { result } = await setup();
      await act(async () => {
        await result.current.selectPhoto();
      });
      expect(announcements).toEqual([STARTED]);
      expect(result.current.failure?.message).toBeTruthy();
      expect(announcements).not.toContain(result.current.failure?.message);
    },
  );

  test("a successful retry announces the start again and then the success", async () => {
    mockStart.mockRejectedValueOnce(
      new FakeApiError(503, "object_storage_degraded"),
    );
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    await act(async () => {
      await result.current.retry();
    });
    expect(announcements).toEqual([STARTED, STARTED, CHANGED]);
  });

  test("announces a successful reset to the default image", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.resetToDefault();
    });
    expect(announcements).toEqual([RESET]);
  });

  test("announces nothing for a failed reset or a reset with no avatar", async () => {
    mockUpdateProfile.mockRejectedValueOnce(
      new FakeApiError(0, "network_unavailable"),
    );
    const { result } = await setup();
    await act(async () => {
      await result.current.resetToDefault();
    });
    expect(announcements).toEqual([]);
    mockProfileAvatar = null;
    const second = await setup();
    await act(async () => {
      await second.result.current.resetToDefault();
    });
    expect(announcements).toEqual([]);
  });

  test("an upload abandoned by unmount never announces a success", async () => {
    mockPut.mockImplementation(
      (input: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          input.signal.addEventListener("abort", () =>
            reject(new Error("cancelled")),
          );
        }),
    );
    const { result, unmount } = await setup();
    await act(async () => {
      void result.current.selectPhoto();
    });
    await act(async () => {
      unmount();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(announcements).toEqual([STARTED]);
  });
});

describe("useAvatarUpload media origin (VERIFY fix 1)", () => {
  test("builds the account API with the session API origin and the configured media origin", async () => {
    await setup();
    expect(mockCreateAccountApi).toHaveBeenCalledWith(
      mockPrincipal.origin,
      "https://media.example",
    );
  });

  test("a presigned PUT URL rejected as an invalid media origin shows the generic retryable copy and never PUTs", async () => {
    mockStart.mockRejectedValueOnce(
      new FakeApiError(502, "invalid_media_origin_url"),
    );
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    expect(mockPut).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("failed");
    expect(result.current.failure?.retryable).toBe(true);
    expectNoRawCode(result.current.failure?.message);
    expect(result.current.failure?.message).toMatch(/다시 시도/);
  });
});

describe("useAvatarUpload select photo (AV-AC3)", () => {
  test("runs pick -> U4 -> native PUT -> U5 -> applyProfile in order and releases the staged file", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    expect(calls).toEqual(["pick", "start", "put", "finalize", "apply"]);
    expect(mockStart).toHaveBeenCalledWith(
      "access-token",
      STAGED.byteSize,
      expect.any(AbortSignal),
    );
    expect(mockPut).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://storage.example/put?sig=1",
        file: expect.objectContaining({
          uri: STAGED.uri,
          byteSize: STAGED.byteSize,
          contentType: "image/jpeg",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mockFinalize).toHaveBeenCalledWith(
      "access-token",
      UPLOAD_ID,
      expect.any(AbortSignal),
    );
    expect(mockApplyProfile).toHaveBeenCalledWith(mockFinalProfile);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("idle");
    expect(result.current.busy).toBe(false);
    expect(result.current.failure).toBeNull();
  });

  test("shows progress while uploading and reports busy until the run settles", async () => {
    let finishPut: (value: { status: number }) => void = () => undefined;
    mockPut.mockImplementation(
      (input: { onProgress?: (sent: number, total: number) => void }) =>
        new Promise((resolve) => {
          input.onProgress?.(0, 100);
          input.onProgress?.(25, 100);
          finishPut = resolve;
        }),
    );
    const { result } = await setup();
    let run: Promise<void> = Promise.resolve();
    await act(async () => {
      run = result.current.selectPhoto();
    });
    expect(result.current.phase).toBe("uploading");
    expect(result.current.busy).toBe(true);
    expect(result.current.progress).toBe(0.25);
    await act(async () => {
      finishPut({ status: 200 });
      await run;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  test("blocks duplicate runs while one is in flight (select, select again, reset)", async () => {
    let releasePick: (value: unknown) => void = () => undefined;
    mockPick.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePick = resolve;
        }),
    );
    const { result } = await setup();
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.selectPhoto();
    });
    expect(result.current.phase).toBe("picking");
    await act(async () => {
      await result.current.selectPhoto();
      await result.current.resetToDefault();
    });
    expect(mockPick).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    await act(async () => {
      releasePick({ status: "cancelled" });
      await first;
    });
    expect(result.current.phase).toBe("idle");
  });

  test("a cancelled pick sends nothing and shows no failure", async () => {
    mockPick.mockResolvedValue({ status: "cancelled" });
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    expect(mockStart).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
    expect(result.current.failure).toBeNull();
  });

  test.each([
    [{ status: "permission_denied", canAskAgain: false }, /사진/],
    [{ status: "too_large", byteSize: 2_000_000 }, /용량/],
    [{ status: "failed" }, /사진/],
  ])(
    "a %j pick result becomes a Korean failure and sends nothing",
    async (selection, pattern) => {
      mockPick.mockResolvedValue(selection);
      const { result } = await setup();
      await act(async () => {
        await result.current.selectPhoto();
      });
      expect(mockStart).not.toHaveBeenCalled();
      expect(result.current.phase).toBe("failed");
      expectNoRawCode(result.current.failure?.message);
      expect(result.current.failure?.message).toMatch(pattern);
    },
  );

  test.each([
    [new FakeApiError(503, "object_storage_degraded"), /저장소/],
    [new FakeApiError(429, "rate_limit_exceeded"), /잠시 후/],
    [new FakeApiError(0, "network_unavailable"), /네트워크/],
    [new FakeApiError(408, "request_timeout"), /네트워크/],
    [new FakeApiError(500, "request_failed"), /다시 시도/],
  ])(
    "a U4 failure %j shows a Korean reason, never the code, and keeps the photo for retry",
    async (error, pattern) => {
      mockStart.mockRejectedValueOnce(error);
      const { result } = await setup();
      await act(async () => {
        await result.current.selectPhoto();
      });
      expect(result.current.phase).toBe("failed");
      expect(result.current.failure?.retryable).toBe(true);
      expectNoRawCode(result.current.failure?.message);
      expect(result.current.failure?.message).toMatch(pattern);
      expect(mockPut).not.toHaveBeenCalled();
      expect(mockRelease).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.retry();
      });
      expect(mockPick).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(2);
      expect(mockApplyProfile).toHaveBeenCalledWith(mockFinalProfile);
      expect(result.current.phase).toBe("idle");
      expect(mockRelease).toHaveBeenCalledTimes(1);
    },
  );

  test("a non-2xx PUT fails without calling U5 and retry re-runs from U4", async () => {
    mockPut.mockResolvedValueOnce({ status: 403 });
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("failed");
    expectNoRawCode(result.current.failure?.message);
    await act(async () => {
      await result.current.retry();
    });
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockFinalize).toHaveBeenCalledTimes(1);
  });

  test("a native PUT transfer error surfaces a network reason", async () => {
    mockPut.mockRejectedValueOnce(
      Object.assign(new Error("network"), { reason: "network" }),
    );
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    expect(result.current.phase).toBe("failed");
    expectNoRawCode(result.current.failure?.message);
  });

  test.each([
    [new FakeApiError(422, "avatar_object_invalid"), false, /다른 사진/],
    [new FakeApiError(404, "avatar_upload_not_found"), true, /다시 시도/],
    [new FakeApiError(409, "avatar_upload_not_pending"), true, /다시 시도/],
    [new FakeApiError(503, "object_storage_degraded"), true, /저장소/],
    [new FakeApiError(401, "authentication_required"), false, /로그인/],
  ])(
    "a U5 failure %j maps to a Korean reason (retryable=%s)",
    async (error, retryable, pattern) => {
      mockFinalize.mockRejectedValueOnce(error);
      const { result } = await setup();
      await act(async () => {
        await result.current.selectPhoto();
      });
      expect(mockApplyProfile).not.toHaveBeenCalled();
      expect(result.current.phase).toBe("failed");
      expect(result.current.failure?.retryable).toBe(retryable);
      expectNoRawCode(result.current.failure?.message);
      expect(result.current.failure?.message).toMatch(pattern);
      // A non-retryable failure frees the staged file immediately.
      if (!retryable) expect(mockRelease).toHaveBeenCalledTimes(1);
    },
  );

  test("dismissFailure clears the failure and deletes the kept staged file", async () => {
    mockStart.mockRejectedValueOnce(
      new FakeApiError(503, "object_storage_degraded"),
    );
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    await act(async () => {
      result.current.dismissFailure();
    });
    expect(result.current.failure).toBeNull();
    expect(result.current.phase).toBe("idle");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test("selecting another photo after a failure releases the previously kept file first", async () => {
    mockStart.mockRejectedValueOnce(
      new FakeApiError(503, "object_storage_degraded"),
    );
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    expect(mockRelease).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.selectPhoto();
    });
    expect(mockPick).toHaveBeenCalledTimes(2);
    // once for the stale kept file, once for the successful new run
    expect(mockRelease).toHaveBeenCalledTimes(2);
  });

  test("a failed pick retries by opening the picker again", async () => {
    mockPick.mockResolvedValueOnce({ status: "failed" });
    const { result } = await setup();
    await act(async () => {
      await result.current.selectPhoto();
    });
    await act(async () => {
      await result.current.retry();
    });
    expect(mockPick).toHaveBeenCalledTimes(2);
    expect(mockApplyProfile).toHaveBeenCalledWith(mockFinalProfile);
  });

  test("unmounting mid-upload aborts the request, deletes the staged file and never applies the profile", async () => {
    const captured: { signal?: AbortSignal } = {};
    mockPut.mockImplementation(
      (input: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          captured.signal = input.signal;
          input.signal.addEventListener("abort", () =>
            reject(new Error("cancelled")),
          );
        }),
    );
    const { result, unmount } = await setup();
    await act(async () => {
      void result.current.selectPhoto();
    });
    expect(captured.signal?.aborted).toBe(false);
    await act(async () => {
      unmount();
    });
    expect(captured.signal?.aborted).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(mockApplyProfile).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test("unmounting while the picker is open drops the late result and deletes its file", async () => {
    let releasePick: (value: unknown) => void = () => undefined;
    mockPick.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePick = resolve;
        }),
    );
    const { result, unmount } = await setup();
    await act(async () => {
      void result.current.selectPhoto();
    });
    await act(async () => {
      unmount();
    });
    await act(async () => {
      releasePick(ready());
      await Promise.resolve();
    });
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe("useAvatarUpload reset to default image (AV-AC1/AV-AC3)", () => {
  test("hasAvatar reflects the session profile's avatar", async () => {
    const { result, rerender } = await setup();
    expect(result.current.hasAvatar).toBe(true);
    mockProfileAvatar = null;
    await rerender({});
    expect(result.current.hasAvatar).toBe(false);
    mockProfileAvatar = "";
    await rerender({});
    expect(result.current.hasAvatar).toBe(false);
  });

  test("clears through U2 with the empty string, then applies the returned profile", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.resetToDefault();
    });
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      "access-token",
      { avatarUrl: "" },
      expect.any(AbortSignal),
    );
    expect(mockApplyProfile).toHaveBeenCalledWith(mockClearedProfile);
    expect(mockPick).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
  });

  test("sends nothing when there is no avatar to reset", async () => {
    mockProfileAvatar = null;
    const { result } = await setup();
    await act(async () => {
      await result.current.resetToDefault();
    });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockApplyProfile).not.toHaveBeenCalled();
  });

  test("a failed clear shows a Korean reason and retry re-sends the clear", async () => {
    mockUpdateProfile.mockRejectedValueOnce(
      new FakeApiError(0, "network_unavailable"),
    );
    const { result } = await setup();
    await act(async () => {
      await result.current.resetToDefault();
    });
    expect(result.current.phase).toBe("failed");
    expectNoRawCode(result.current.failure?.message);
    expect(mockApplyProfile).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.retry();
    });
    expect(mockUpdateProfile).toHaveBeenCalledTimes(2);
    expect(mockApplyProfile).toHaveBeenCalledWith(mockClearedProfile);
    expect(result.current.failure).toBeNull();
  });

  test("unmounting during a clear aborts it and applies nothing", async () => {
    const captured: { signal?: AbortSignal } = {};
    mockUpdateProfile.mockImplementation(
      (_token: string, _input: unknown, abortSignal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          captured.signal = abortSignal;
          abortSignal.addEventListener("abort", () =>
            reject(new Error("cancelled")),
          );
        }),
    );
    const { result, unmount } = await setup();
    await act(async () => {
      void result.current.resetToDefault();
    });
    await act(async () => {
      unmount();
    });
    expect(captured.signal?.aborted).toBe(true);
    expect(mockApplyProfile).not.toHaveBeenCalled();
  });
});
