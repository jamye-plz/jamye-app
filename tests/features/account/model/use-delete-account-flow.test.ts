import { act, renderHook } from "@testing-library/react-native";

import type { AccountLifecycle } from "@/features/account/model/account-lifecycle";
import { useDeleteAccountFlow } from "@/features/account/model/use-delete-account-flow";

const mockUseSession = jest.fn();
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => mockUseSession(),
}));

const mockSignIn = jest.fn();
jest.mock("@/core/auth/apple-authentication-port", () => ({
  appleAuthenticationPort: {
    isAvailableAsync: async () => true,
    signIn: (...args: unknown[]) => mockSignIn(...args),
  },
}));

const mockCreateAppleNonce = jest.fn();
jest.mock("@/core/auth/apple-authentication.shared", () => ({
  createAppleNonce: () => mockCreateAppleNonce(),
}));

function fakeLifecycle(
  overrides: Partial<AccountLifecycle> = {},
): AccountLifecycle {
  return {
    deleteAccount: jest.fn(),
    updateNickname: jest.fn(),
    ...overrides,
  };
}

function fakeSession(provider: string | null) {
  return { state: { profile: provider ? { provider } : null } };
}

beforeEach(() => {
  mockUseSession.mockReturnValue(fakeSession("kakao"));
  mockCreateAppleNonce.mockResolvedValue({
    raw: "raw-nonce",
    hashed: "hashed-nonce",
  });
  mockSignIn.mockReset();
});

describe("useDeleteAccountFlow", () => {
  test("starts hidden and idle", async () => {
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle()),
    );
    expect(result.current.confirmVisible).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(result.current.failureMessage).toBeNull();
  });

  test("requestConfirm shows the alert; dismissConfirm hides it without deleting (A4)", async () => {
    const deleteAccount = jest.fn();
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.requestConfirm();
    });
    expect(result.current.confirmVisible).toBe(true);
    await act(async () => {
      result.current.dismissConfirm();
    });
    expect(result.current.confirmVisible).toBe(false);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  test("confirmDelete calls deleteAccount, closes the alert, and clears the failure message on ok", async () => {
    const deleteAccount = jest.fn().mockResolvedValue({ status: "ok" });
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.requestConfirm();
    });
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(deleteAccount).toHaveBeenCalledWith(undefined);
    expect(result.current.confirmVisible).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(result.current.failureMessage).toBeNull();
  });

  test("surfaces the blocked message as a failure alert state", async () => {
    const deleteAccount = jest.fn().mockResolvedValue({ status: "blocked" });
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.failureMessage).toBe(
      "그룹 소유권을 먼저 이전한 뒤 다시 시도해 주세요.",
    );
  });

  test("surfaces a generic error message on an error result", async () => {
    const deleteAccount = jest
      .fn()
      .mockResolvedValue({ code: "boom", status: "error" });
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.failureMessage).toBe(
      "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  test("surfaces a generic error message when the promise rejects", async () => {
    const deleteAccount = jest.fn().mockRejectedValue(new Error("network"));
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.failureMessage).toBe(
      "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  // task-app-device fix1: the failure alert's single "확인" button calls this
  // -- pressing it must close the alert (failureMessage back to null)
  // without touching pending/confirmVisible or calling deleteAccount again.
  test("dismissFailure clears the failure alert after a blocked/error result", async () => {
    const deleteAccount = jest.fn().mockResolvedValue({ status: "blocked" });
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.failureMessage).toBe(
      "그룹 소유권을 먼저 이전한 뒤 다시 시도해 주세요.",
    );
    await act(async () => {
      result.current.dismissFailure();
    });
    expect(result.current.failureMessage).toBeNull();
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  test("ignores a second confirmDelete while the first is still pending", async () => {
    let resolveDelete: (value: { status: "ok" }) => void = () => undefined;
    const deleteAccount = jest.fn(
      (): Promise<{ status: "ok" }> =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
    });
    await act(async () => {
      result.current.confirmDelete();
    });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveDelete({ status: "ok" });
      await Promise.resolve();
    });
  });

  test("does nothing when there is no account lifecycle yet", async () => {
    const { result } = await renderHook(() => useDeleteAccountFlow(null));
    await act(async () => {
      result.current.requestConfirm();
    });
    await act(async () => {
      result.current.confirmDelete();
    });
    expect(result.current.pending).toBe(false);
  });
});

describe("APPCON-AC5/U7: Apple reauthentication before delete", () => {
  test("reauthenticates with a fresh nonce and no requested scopes, then sends the proof as deleteAccount's body", async () => {
    mockUseSession.mockReturnValue(fakeSession("apple"));
    mockSignIn.mockResolvedValue({
      type: "success",
      identityToken: "identity-token",
      authorizationCode: "authorization-code",
    });
    const deleteAccount = jest.fn().mockResolvedValue({ status: "ok" });
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSignIn).toHaveBeenCalledWith({
      nonce: "hashed-nonce",
      requestedScopes: [],
    });
    expect(deleteAccount).toHaveBeenCalledWith({
      identityToken: "identity-token",
      authorizationCode: "authorization-code",
      rawNonce: "raw-nonce",
    });
    expect(result.current.failureMessage).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  test("a cancelled reauthentication sends no request and silently returns to the original screen", async () => {
    mockUseSession.mockReturnValue(fakeSession("apple"));
    mockSignIn.mockResolvedValue({ type: "cancel" });
    const deleteAccount = jest.fn();
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(result.current.failureMessage).toBeNull();
    expect(result.current.pending).toBe(false);
    expect(result.current.confirmVisible).toBe(false);
  });

  test("a native reauthentication error surfaces the generic delete-error message without calling deleteAccount", async () => {
    mockUseSession.mockReturnValue(fakeSession("apple"));
    mockSignIn.mockResolvedValue({ type: "error", message: "boom" });
    const deleteAccount = jest.fn();
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(result.current.failureMessage).toBe(
      "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  test("Kakao/Google accounts skip Apple reauthentication entirely and call deleteAccount with no proof", async () => {
    mockUseSession.mockReturnValue(fakeSession("google"));
    const deleteAccount = jest.fn().mockResolvedValue({ status: "ok" });
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(deleteAccount).toHaveBeenCalledWith(undefined);
    expect(result.current.failureMessage).toBeNull();
  });

  test("Android guard (plan api_contracts.app.apple_delete_E16_U7.android_guard): the default/non-iOS port's unavailable result blocks deletion with the existing error UI and no server call", async () => {
    mockUseSession.mockReturnValue(fakeSession("apple"));
    // Forces the non-iOS (default/Android) apple-authentication-port.ts
    // stub's actual return shape through the mock -- that port's signIn()
    // always resolves `{type:"error", message: UNAVAILABLE_MESSAGE}` (it
    // never reaches a native sheet), so this exercises the same
    // `result.type === "error"` branch a genuine iOS failure would hit.
    mockSignIn.mockResolvedValue({
      type: "error",
      message: "이 기기에서는 Apple로 로그인할 수 없습니다.",
    });
    const deleteAccount = jest.fn();
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(result.current.failureMessage).toBe(
      "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });
});
