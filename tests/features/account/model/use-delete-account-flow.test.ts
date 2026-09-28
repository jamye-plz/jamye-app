import { act, renderHook } from "@testing-library/react-native";

import type { AccountLifecycle } from "@/features/account/model/account-lifecycle";
import { useDeleteAccountFlow } from "@/features/account/model/use-delete-account-flow";

function fakeLifecycle(
  overrides: Partial<AccountLifecycle> = {},
): AccountLifecycle {
  return {
    deleteAccount: jest.fn(),
    updateNickname: jest.fn(),
    ...overrides,
  };
}

describe("useDeleteAccountFlow", () => {
  test("starts hidden and idle", async () => {
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle()),
    );
    expect(result.current.confirmVisible).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(result.current.message).toBeNull();
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

  test("confirmDelete calls deleteAccount, closes the alert, and clears the message on ok", async () => {
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
    expect(result.current.confirmVisible).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(result.current.message).toBeNull();
  });

  test("surfaces the blocked message", async () => {
    const deleteAccount = jest.fn().mockResolvedValue({ status: "blocked" });
    const { result } = await renderHook(() =>
      useDeleteAccountFlow(fakeLifecycle({ deleteAccount })),
    );
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.message).toBe(
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
    expect(result.current.message).toBe(
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
    expect(result.current.message).toBe(
      "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
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
