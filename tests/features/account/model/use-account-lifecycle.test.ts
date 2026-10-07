import { renderHook } from "@testing-library/react-native";

import { useAccountLifecycle } from "@/features/account/model/use-account-lifecycle";

const PRINCIPAL = {
  origin: "https://api.example",
  userId: "11111111-1111-4111-8111-111111111111",
  epoch: 1,
};

const mockUseSession = jest.fn();
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => mockUseSession(),
}));

const mockPurge = { recordAccountDeletion: jest.fn(async () => undefined) };
jest.mock("@/core/providers/app-providers", () => ({
  useAccountLocalDataPurge: () => mockPurge,
}));

const mockDeleteAccount = jest.fn(async () => undefined);
jest.mock("@/features/account/data/account-api", () => ({
  createAccountApi: jest.fn(() => ({
    updateProfile: jest.fn(),
    deleteAccount: (...args: unknown[]) =>
      (mockDeleteAccount as (...a: unknown[]) => Promise<void>)(...args),
  })),
}));

function session(principal: typeof PRINCIPAL | null) {
  return {
    principal,
    applyProfile: jest.fn(),
    authorizedRequest: jest.fn(
      (execute: (token: string, signal: AbortSignal) => Promise<unknown>) =>
        execute("access-token", new AbortController().signal),
    ),
    logout: jest.fn(async () => undefined),
  };
}

beforeEach(() => {
  mockPurge.recordAccountDeletion.mockClear();
  mockDeleteAccount.mockClear();
});

describe("useAccountLifecycle wiring (CLN-AC1)", () => {
  test("is null without a signed-in principal", async () => {
    mockUseSession.mockReturnValue(session(null));
    const { result } = await renderHook(() => useAccountLifecycle());
    expect(result.current).toBeNull();
  });

  test("injects the purge port and the session principal into the lifecycle", async () => {
    mockUseSession.mockReturnValue(session(PRINCIPAL));
    const { result } = await renderHook(() => useAccountLifecycle());
    expect(result.current).not.toBeNull();
    await expect(result.current?.deleteAccount()).resolves.toEqual({
      status: "ok",
    });
    expect(mockPurge.recordAccountDeletion).toHaveBeenCalledWith({
      origin: PRINCIPAL.origin,
      userId: PRINCIPAL.userId,
    });
  });

  test("keeps the same lifecycle while the principal identity is unchanged and rebuilds it for another account", async () => {
    const first = session(PRINCIPAL);
    mockUseSession.mockReturnValue(first);
    const { result, rerender } = await renderHook(() => useAccountLifecycle());
    const initial = result.current;
    mockUseSession.mockReturnValue({
      ...first,
      principal: { ...PRINCIPAL, epoch: 2 },
    });
    await rerender({});
    expect(result.current).toBe(initial);

    mockUseSession.mockReturnValue({
      ...first,
      principal: {
        ...PRINCIPAL,
        userId: "22222222-2222-4222-8222-222222222222",
      },
    });
    await rerender({});
    expect(result.current).not.toBe(initial);
  });
});
