import { createAccountLifecycle } from "@/features/account/model/account-lifecycle";
import type { AccountApiPort } from "@/features/account/model/account-lifecycle";
import type { SessionContextValue } from "@/core/providers/session-provider";

const profile = {
  id: "id",
  provider: "kakao",
  nickname: "name",
  avatarUrl: null,
  createdAt: "2020-01-01T00:00:00Z",
};

type FakeSession = Pick<
  SessionContextValue,
  "authorizedRequest" | "logout" | "applyProfile"
>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fixture(
  overrides: Readonly<{
    accountApi?: Partial<AccountApiPort>;
    session?: Partial<FakeSession>;
  }> = {},
) {
  const accountApi: AccountApiPort = {
    updateProfile: jest.fn(async () => profile),
    deleteAccount: jest.fn(async () => undefined),
    ...overrides.accountApi,
  };
  const session: FakeSession = {
    authorizedRequest: jest.fn((execute) =>
      execute("access-token", new AbortController().signal),
    ) as unknown as FakeSession["authorizedRequest"],
    logout: jest.fn(async () => undefined),
    applyProfile: jest.fn(),
    ...overrides.session,
  };
  return {
    accountApi,
    session,
    lifecycle: createAccountLifecycle({ accountApi, session }),
  };
}

describe("account lifecycle: updateNickname", () => {
  test("rejects an empty/whitespace-only trimmed nickname without any request", async () => {
    const f = fixture();
    const result = await f.lifecycle.updateNickname("   ");
    expect(result).toEqual({ status: "invalid", reason: "empty" });
    expect(f.session.authorizedRequest).not.toHaveBeenCalled();
    expect(f.accountApi.updateProfile).not.toHaveBeenCalled();
    expect(f.session.applyProfile).not.toHaveBeenCalled();
  });

  test("rejects a >64-char trimmed nickname without any request", async () => {
    const f = fixture();
    const result = await f.lifecycle.updateNickname(`  ${"a".repeat(65)}  `);
    expect(result).toEqual({ status: "invalid", reason: "too_long" });
    expect(f.session.authorizedRequest).not.toHaveBeenCalled();
    expect(f.accountApi.updateProfile).not.toHaveBeenCalled();
  });

  test("accepts a boundary 64-char trimmed nickname", async () => {
    const f = fixture();
    const nickname = "a".repeat(64);
    const result = await f.lifecycle.updateNickname(`  ${nickname}  `);
    expect(result).toEqual({ status: "ok", profile });
    expect(f.accountApi.updateProfile).toHaveBeenCalledWith(
      "access-token",
      { nickname },
      expect.any(AbortSignal),
    );
  });

  test("trims, calls updateProfile via authorizedRequest, and applies the resulting profile exactly once on success", async () => {
    const f = fixture();
    const result = await f.lifecycle.updateNickname("  new nickname  ");
    expect(result).toEqual({ status: "ok", profile });
    expect(f.session.authorizedRequest).toHaveBeenCalledTimes(1);
    expect(f.accountApi.updateProfile).toHaveBeenCalledWith(
      "access-token",
      { nickname: "new nickname" },
      expect.any(AbortSignal),
    );
    expect(f.session.applyProfile).toHaveBeenCalledTimes(1);
    expect(f.session.applyProfile).toHaveBeenCalledWith(profile);
  });

  test("returns a discriminated error and never throws when the request rejects", async () => {
    const f = fixture({
      accountApi: {
        updateProfile: jest.fn(async () => {
          throw { status: 503, code: "database_unavailable" };
        }),
      },
    });
    await expect(f.lifecycle.updateNickname("new nickname")).resolves.toEqual({
      status: "error",
      code: "database_unavailable",
    });
    expect(f.session.applyProfile).not.toHaveBeenCalled();
  });
});

describe("account lifecycle: deleteAccount", () => {
  // task-app-device fix1 (device verification): deleteAccount() no longer disables
  // push before the DELETE call. AccountLifecycleDeps has no `pushDisable`
  // dependency anymore, so there is no such call left to order against
  // authorizedRequest -- the server disables push installations inside its
  // own deletion transaction instead (see account-lifecycle.ts's comment).
  test("calls authorizedRequest(deleteAccount) before session.logout() on success", async () => {
    const f = fixture();
    const result = await f.lifecycle.deleteAccount();
    expect(result).toEqual({ status: "ok" });
    const authorizedOrder = (f.session.authorizedRequest as jest.Mock).mock
      .invocationCallOrder[0];
    const logoutOrder = (f.session.logout as jest.Mock).mock
      .invocationCallOrder[0];
    expect(authorizedOrder).toBeLessThan(logoutOrder);
    // APPCON-AC5 round 2: deleteAccount() always forwards a (possibly
    // undefined) appleProof as accountApi.deleteAccount's 2nd positional
    // arg -- signal must stay last to match every other API method's
    // convention (updateProfile/exchange/refresh/profile/logout), so a
    // Kakao/Google call (no proof) now passes an explicit `undefined` here
    // rather than omitting the argument.
    expect(f.accountApi.deleteAccount).toHaveBeenCalledWith(
      "access-token",
      undefined,
      expect.any(AbortSignal),
    );
  });

  test("APPCON-AC5: forwards an Apple proof through to accountApi.deleteAccount unchanged", async () => {
    const f = fixture();
    const appleProof = {
      identityToken: "identity-token",
      authorizationCode: "authorization-code",
      rawNonce: "raw-nonce",
    };
    const result = await f.lifecycle.deleteAccount(appleProof);
    expect(result).toEqual({ status: "ok" });
    expect(f.accountApi.deleteAccount).toHaveBeenCalledWith(
      "access-token",
      appleProof,
      expect.any(AbortSignal),
    );
  });

  test("resolves ok even if the best-effort logout call itself rejects", async () => {
    const f = fixture({
      session: {
        logout: jest.fn(async () => {
          throw new Error("logout failed");
        }),
      },
    });
    await expect(f.lifecycle.deleteAccount()).resolves.toEqual({
      status: "ok",
    });
  });

  // task-app-device fix1 regression: a blocked delete must never touch push
  // state. There is no `pushDisable` dependency left to call (removed from
  // AccountLifecycleDeps), so this doubles as proof no such call happens --
  // session.logout() (the only thing that could unregister a device
  // locally) is also never reached.
  test("returns 'blocked' and never calls logout on group_ownership_transfer_required", async () => {
    const f = fixture({
      accountApi: {
        deleteAccount: jest.fn(async () => {
          throw { status: 409, code: "group_ownership_transfer_required" };
        }),
      },
    });
    const result = await f.lifecycle.deleteAccount();
    expect(result).toEqual({ status: "blocked" });
    expect(f.session.logout).not.toHaveBeenCalled();
  });

  // task-app-device fix1 regression: same as the 'blocked' case above, for
  // every other rejection code (409 aside) -- e.g. 422 Apple proof errors,
  // 500/503, network failures.
  test("returns 'error' distinct from 'blocked' and never calls logout on any other rejection", async () => {
    const f = fixture({
      accountApi: {
        deleteAccount: jest.fn(async () => {
          throw { status: 503, code: "database_unavailable" };
        }),
      },
    });
    const result = await f.lifecycle.deleteAccount();
    expect(result).toEqual({ status: "error", code: "database_unavailable" });
    expect(f.session.logout).not.toHaveBeenCalled();
  });

  test("a second concurrent deleteAccount call while one is pending returns an in-flight error and never double-deletes", async () => {
    const gate = deferred<void>();
    const f = fixture({
      accountApi: {
        deleteAccount: jest.fn(async () => gate.promise),
      },
    });
    const first = f.lifecycle.deleteAccount();
    const second = f.lifecycle.deleteAccount();
    await expect(second).resolves.toEqual({
      status: "error",
      code: "in_flight",
    });
    gate.resolve();
    await expect(first).resolves.toEqual({ status: "ok" });
    expect(f.accountApi.deleteAccount).toHaveBeenCalledTimes(1);
  });

  test("a concurrent updateNickname call while deleteAccount is pending returns an in-flight error", async () => {
    const gate = deferred<void>();
    const f = fixture({
      accountApi: {
        deleteAccount: jest.fn(async () => gate.promise),
      },
    });
    const deletePromise = f.lifecycle.deleteAccount();
    await expect(f.lifecycle.updateNickname("new nickname")).resolves.toEqual({
      status: "error",
      code: "in_flight",
    });
    gate.resolve();
    await deletePromise;
    expect(f.accountApi.updateProfile).not.toHaveBeenCalled();
  });

  test("maps a rejection without a string code to the unknown_error result and never logs out", async () => {
    const f = fixture({
      accountApi: {
        deleteAccount: jest.fn(async () => {
          throw new Error("boom");
        }),
      },
    });
    await expect(f.lifecycle.deleteAccount()).resolves.toEqual({
      code: "unknown_error",
      status: "error",
    });
    expect(f.session.logout).not.toHaveBeenCalled();
  });
});
