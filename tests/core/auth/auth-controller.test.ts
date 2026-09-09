import { createAuthController } from "@/core/auth/auth-controller";

const state = "s".repeat(43);
const pair = {
  accessToken: "access",
  accessTokenExpiresAt: "2030-01-01T00:00:00Z",
  refreshToken: "r".repeat(43),
  refreshTokenExpiresAt: "2031-01-01T00:00:00Z",
};
const profile = {
  id: "id",
  provider: "kakao",
  nickname: "name",
  avatarUrl: null,
  createdAt: "2020-01-01T00:00:00Z",
};
function fixture(overrides: Record<string, unknown> = {}) {
  const api = {
    authorize: jest.fn(async () => ({
      authorizationUrl: "https://kauth.kakao.com/oauth/authorize",
      state,
      expiresInSeconds: 600,
    })),
    exchange: jest.fn(async () => pair),
    refresh: jest.fn(async () => pair),
    profile: jest.fn(async () => profile),
    logout: jest.fn(async () => undefined),
    ...(overrides.api as object),
  };
  const store = {
    load: jest.fn(async () => null),
    save: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
    ...(overrides.store as object),
  };
  const openBrowser = jest.fn(async () => ({
    type: "success" as const,
    url: `jamye://oauth/kakao?code=code&state=${state}`,
  }));
  return {
    api,
    store,
    openBrowser,
    controller: createAuthController({
      origin: "https://api.example",
      api,
      store,
      openBrowser,
      createPkce: async () => ({
        verifier: "v".repeat(43),
        challenge: "c".repeat(43),
      }),
      nowMs: () => 100,
    }),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("auth session controller", () => {
  test.each(["save", "load"])(
    "an abandoned controller's in-flight %s cannot replace the next controller's secure record",
    async (phase) => {
      const started = deferred();
      const release = deferred();
      let stored: typeof pair | null = null;
      const nextPair = { ...pair, accessToken: "next-account-access" };
      const f = fixture({
        store: {
          load: async () => {
            started.resolve();
            await release.promise;
            stored = null; // A malformed/mismatched legacy record may be deleted by load().
            return null;
          },
          save: async (_origin: string, value: typeof pair) => {
            if (value.accessToken === pair.accessToken) {
              started.resolve();
              await release.promise;
            }
            stored = value;
          },
        },
      });
      const old =
        phase === "load"
          ? f.controller.restore()
          : f.controller.signIn(
              "kakao",
              "https://api.example/callback",
              "jamye://oauth/kakao",
            );
      await started.promise;
      f.controller.dispose();
      const next = createAuthController({
        origin: "https://next.example",
        api: { ...f.api, exchange: async () => nextPair },
        store: f.store,
        openBrowser: f.openBrowser,
        createPkce: async () => ({
          verifier: "v".repeat(43),
          challenge: "c".repeat(43),
        }),
        nowMs: () => 100,
      });
      const login = next.signIn(
        "kakao",
        "https://next.example/callback",
        "jamye://oauth/kakao",
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      release.resolve();
      await Promise.all([old, login]);
      expect(stored).toEqual(nextPair);
      expect(next.getState().status).toBe("signed-in");
    },
  );

  test("a failed save after rotation never leaves the consumed refresh token retryable", async () => {
    const f = fixture({
      store: {
        load: async () => pair,
        save: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error("locked")),
      },
      api: {
        refresh: jest.fn(async () => ({
          ...pair,
          refreshToken: "n".repeat(43),
        })),
      },
    });
    await f.controller.restore();
    await f.controller.refresh();
    expect(f.controller.getState()).toMatchObject({
      status: "signed-out",
      profile: null,
    });
    await f.controller.retryProfile();
    expect(f.api.refresh).toHaveBeenCalledTimes(1);
  });

  test.each(["restore", "exchange", "save", "profile"])(
    "logout wins over late %s completion",
    async (phase) => {
      const started = deferred();
      const release = deferred();
      const pause = async () => {
        started.resolve();
        await release.promise;
      };
      const load = jest.fn(async () => {
        if (phase === "restore") await pause();
        return pair;
      });
      const exchange = jest.fn(async () => {
        if (phase === "exchange") await pause();
        return pair;
      });
      const save = jest.fn(async () => {
        if (phase === "save") await pause();
      });
      const readProfile = jest.fn(async () => {
        if (phase === "profile") await pause();
        return profile;
      });
      const f = fixture({
        store: { load, save },
        api: { exchange, profile: readProfile },
      });
      const pending =
        phase === "restore" || phase === "profile"
          ? f.controller.restore()
          : f.controller.signIn(
              "kakao",
              "https://api.example/callback",
              "jamye://oauth/kakao",
            );
      await started.promise;
      const logout = f.controller.logout();
      release.resolve();
      await Promise.all([pending, logout]);
      expect(f.controller.getState()).toMatchObject({
        status: "signed-out",
        profile: null,
      });
      expect(f.store.clear).toHaveBeenCalledTimes(1);
      if (phase === "restore" || phase === "exchange")
        expect(save).not.toHaveBeenCalled();
      await f.controller.refresh();
      expect(f.api.refresh).not.toHaveBeenCalled();
    },
  );
  test("allows refresh again after a no-session call and a terminal expired session", async () => {
    const f = fixture({
      store: {
        load: jest.fn(async () => ({
          ...pair,
          accessTokenExpiresAt: "1970-01-01T00:00:00Z",
          refreshTokenExpiresAt: "1970-01-01T00:00:00Z",
        })),
      },
    });
    await expect(f.controller.refresh()).resolves.toBeNull();
    await f.controller.restore();
    await f.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    await f.controller.refresh();
    expect(f.api.refresh).toHaveBeenCalledTimes(1);
    expect(f.controller.getState().status).toBe("signed-in");
  });
  test("exchanges only a matched PKCE callback and stores the origin-bound pair", async () => {
    const { controller, api, store, openBrowser } = fixture();
    await controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    expect(api.authorize).toHaveBeenCalledWith(
      "kakao",
      {
        redirectUri: "https://api.example/callback",
        challenge: "c".repeat(43),
      },
      expect.anything(),
    );
    expect(api.exchange).toHaveBeenCalledWith(
      "kakao",
      {
        authorizationCode: "code",
        state,
        verifier: "v".repeat(43),
        redirectUri: "https://api.example/callback",
      },
      expect.anything(),
    );
    expect(store.save).toHaveBeenCalledWith("https://api.example", pair);
    expect(openBrowser).toHaveBeenCalledWith(
      "https://kauth.kakao.com/oauth/authorize",
      "jamye://oauth/kakao",
    );
    expect(controller.getState()).toMatchObject({
      status: "signed-in",
      profile,
    });
  });
  test("cancellation, provider/state mismatch, and expiry do not exchange", async () => {
    const cancelled = fixture();
    (cancelled.openBrowser as jest.Mock).mockResolvedValue({ type: "cancel" });
    await cancelled.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    expect(cancelled.api.exchange).not.toHaveBeenCalled();
    expect(cancelled.controller.getState().status).toBe("signed-out");
    const mismatched = fixture();
    mismatched.openBrowser.mockResolvedValue({
      type: "success",
      url: `jamye://oauth/google?code=x&state=${state}`,
    });
    await mismatched.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    expect(mismatched.api.exchange).not.toHaveBeenCalled();
    expect(mismatched.controller.getState().status).toBe("error");
    expect(mismatched.controller.getState().retryAction).toBeUndefined();
  });
  test("restores matching origin, refreshes only once, and logout wins over late work", async () => {
    const restored = fixture({ store: { load: jest.fn(async () => pair) } });
    await restored.controller.restore();
    expect(restored.store.load).toHaveBeenCalledWith("https://api.example");
    expect(restored.controller.getState().status).toBe("signed-in");
    const refreshing = fixture();
    await refreshing.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    await Promise.all([
      refreshing.controller.refresh(),
      refreshing.controller.refresh(),
    ]);
    expect(refreshing.api.refresh).toHaveBeenCalledTimes(1);
    const late = fixture({
      api: {
        profile: jest.fn(
          () =>
            new Promise<typeof profile>((resolve) =>
              setTimeout(() => resolve(profile), 1),
            ),
        ),
      },
    });
    const signingIn = late.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    await late.controller.logout();
    await signingIn;
    expect(late.controller.getState().status).toBe("signed-out");
    expect(late.store.clear).toHaveBeenCalled();
  });
  test("reports SecureStore clear failure rather than silently reviving a session", async () => {
    const { controller, store } = fixture({
      store: {
        clear: jest.fn(async () => {
          throw new Error("unavailable");
        }),
      },
    });
    await controller.logout();
    expect(controller.getState()).toMatchObject({
      status: "error",
      message: expect.stringMatching(/보안 저장소/),
      retryAction: "logout",
    });
    expect(store.clear).toHaveBeenCalled();
  });

  test("uses expiry before profile and keeps rotated credentials after a recoverable profile failure", async () => {
    const expired = { ...pair, accessTokenExpiresAt: "1970-01-01T00:00:00Z" };
    const restored = fixture({ store: { load: jest.fn(async () => expired) } });
    await restored.controller.restore();
    expect(restored.api.refresh).toHaveBeenCalledWith(
      expired.refreshToken,
      expect.anything(),
    );
    expect(restored.controller.getState().status).toBe("signed-in");

    const rotated = {
      ...pair,
      accessToken: "rotated-access",
      refreshToken: "q".repeat(43),
    };
    const api = {
      refresh: jest.fn(async () => rotated),
      profile: jest.fn(async () => {
        throw { status: 503 };
      }),
    };
    const recovering = fixture({ api });
    await recovering.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    await recovering.controller.refresh();
    expect(recovering.store.save).toHaveBeenLastCalledWith(
      "https://api.example",
      rotated,
    );
    expect(recovering.controller.getState()).toMatchObject({
      status: "error",
      message: expect.stringMatching(/갱신/),
      retryAction: "retryProfile",
    });
  });

  test("covers restore storage, empty, profile failure, and terminal refresh paths", async () => {
    const unavailable = fixture({
      store: {
        load: jest.fn(async () => {
          throw new Error("locked");
        }),
      },
    });
    await unavailable.controller.restore();
    expect(unavailable.controller.getState()).toMatchObject({
      status: "error",
      message: expect.stringMatching(/보안 저장소/),
      retryAction: "restore",
    });
    const empty = fixture();
    await empty.controller.restore();
    expect(empty.controller.getState().status).toBe("signed-out");
    const brokenProfile = fixture({
      store: { load: jest.fn(async () => pair) },
      api: {
        profile: jest.fn(async () => {
          throw { status: 503 };
        }),
      },
    });
    await brokenProfile.controller.restore();
    expect(brokenProfile.controller.getState()).toMatchObject({
      status: "error",
      message: expect.stringMatching(/복원/),
      retryAction: "retryProfile",
    });
    const unauthorized = fixture({
      store: { load: jest.fn(async () => pair) },
      api: {
        profile: jest.fn(async () => {
          throw { status: 401 };
        }),
        refresh: jest.fn(async () => {
          throw { status: 401 };
        }),
      },
    });
    await unauthorized.controller.restore();
    expect(unauthorized.store.clear).toHaveBeenCalled();
    expect(unauthorized.controller.getState().status).toBe("signed-out");
  });

  test("covers dismiss, provider error, expired refresh, retry profile, and logout server failure", async () => {
    const dismissed = fixture();
    (dismissed.openBrowser as jest.Mock).mockResolvedValue({ type: "dismiss" });
    await dismissed.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    expect(dismissed.controller.getState()).toMatchObject({
      status: "signed-out",
      message: expect.stringMatching(/취소/),
    });
    const denied = fixture();
    (denied.openBrowser as jest.Mock).mockResolvedValue({
      type: "success",
      url: `jamye://oauth/kakao?error=access_denied&state=${state}`,
    });
    await denied.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    expect(denied.controller.getState().status).toBe("signed-out");
    const expired = fixture({
      store: {
        load: jest.fn(async () => ({
          ...pair,
          accessTokenExpiresAt: "1970-01-01T00:00:00Z",
          refreshTokenExpiresAt: "1970-01-01T00:00:00Z",
        })),
      },
    });
    await expired.controller.restore();
    expect(expired.store.clear).toHaveBeenCalled();
    const retry = fixture();
    await retry.controller.retryProfile();
    expect(retry.controller.getState().status).toBe("loading");
    const logout = fixture({
      api: {
        logout: jest.fn(async () => {
          throw new Error("offline");
        }),
      },
    });
    await logout.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    await logout.controller.logout();
    expect(logout.controller.getState().status).toBe("signed-out");
  });
  test("surfaces expired-clear failure and retries a stored profile", async () => {
    const expires = {
      ...pair,
      accessTokenExpiresAt: "1970-01-01T00:00:00Z",
      refreshTokenExpiresAt: "1970-01-01T00:00:00Z",
    };
    const cannotClear = fixture({
      store: {
        load: jest.fn(async () => expires),
        clear: jest.fn(async () => {
          throw new Error("locked");
        }),
      },
    });
    await cannotClear.controller.restore();
    expect(cannotClear.controller.getState()).toMatchObject({
      status: "error",
      message: expect.stringMatching(/지울/),
      retryAction: "logout",
    });
    const retry = fixture();
    await retry.controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    await retry.controller.retryProfile();
    expect(retry.api.profile).toHaveBeenCalledTimes(2);
  });
  test("dispose fences a queued secure save that has not started executing yet", async () => {
    const releaseFirst = deferred();
    let loadCount = 0;
    const load = jest.fn(async () => {
      loadCount += 1;
      return { ...pair, accessToken: `access-${loadCount}` };
    });
    let saveCount = 0;
    const savedTokens: string[] = [];
    const save = jest.fn(
      async (_origin: string, saved: { accessToken: string }) => {
        saveCount += 1;
        savedTokens.push(saved.accessToken);
        if (saveCount === 1) await releaseFirst.promise;
      },
    );
    const f = fixture({ store: { load, save } });
    const first = f.controller.restore();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    const second = f.controller.restore();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    f.controller.dispose();
    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect(savedTokens).toEqual(["access-1"]);
  });

  test("an old generation's refresh finally does not clear a newer generation's active flight", async () => {
    const releaseOld = deferred();
    const releaseNew = deferred();
    let refreshCount = 0;
    const refresh = jest.fn(async () => {
      refreshCount += 1;
      if (refreshCount === 1) await releaseOld.promise;
      else if (refreshCount === 2) await releaseNew.promise;
      return { ...pair, accessToken: `refreshed-${refreshCount}` };
    });
    const f = fixture({
      store: { load: jest.fn(async () => pair) },
      api: { refresh },
    });
    await f.controller.restore();
    const oldRefresh = f.controller.refresh();
    await Promise.resolve();
    f.controller.dispose();
    await f.controller.restore();
    const newRefresh = f.controller.refresh();
    await Promise.resolve();
    releaseOld.resolve();
    await oldRefresh;
    const afterOldFinally = f.controller.refresh();
    releaseNew.resolve();
    await Promise.all([newRefresh, afterOldFinally]);
    expect(refreshCount).toBe(2);
  });

  test("does not call authorize for a signIn superseded during PKCE creation", async () => {
    const startedPkce = deferred();
    const releasePkce = deferred();
    const createPkce = jest.fn(async () => {
      startedPkce.resolve();
      await releasePkce.promise;
      return { verifier: "v".repeat(43), challenge: "c".repeat(43) };
    });
    const authorize = jest.fn(async () => ({
      authorizationUrl: "https://kauth.kakao.com/oauth/authorize",
      state,
      expiresInSeconds: 600,
    }));
    const store = {
      load: jest.fn(async () => null),
      save: jest.fn(async () => undefined),
      clear: jest.fn(async () => undefined),
    };
    const openBrowser = jest.fn(async () => ({
      type: "success" as const,
      url: `jamye://oauth/kakao?code=code&state=${state}`,
    }));
    const controller = createAuthController({
      origin: "https://api.example",
      api: {
        authorize,
        exchange: jest.fn(async () => pair),
        refresh: jest.fn(async () => pair),
        profile: jest.fn(async () => profile),
        logout: jest.fn(async () => undefined),
      },
      store,
      openBrowser,
      createPkce,
      nowMs: () => 100,
    });
    const stale = controller.signIn(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
    );
    await startedPkce.promise;
    const superseding = controller.logout();
    releasePkce.resolve();
    await Promise.all([stale, superseding]);
    expect(authorize).not.toHaveBeenCalled();
  });

  test("fails closed on an ambiguous rotating-refresh transport outcome instead of retrying blindly", async () => {
    const f = fixture({
      store: { load: jest.fn(async () => pair) },
      api: {
        refresh: jest.fn(async () => {
          throw { status: 0 };
        }),
      },
    });
    await f.controller.restore();
    await f.controller.refresh();
    expect(f.controller.getState()).toMatchObject({
      status: "signed-out",
      message: expect.stringMatching(/확인할 수 없습니다/),
    });
    expect(f.store.clear).toHaveBeenCalled();

    const uncertainServerResponse = fixture({
      store: { load: jest.fn(async () => pair) },
      api: {
        refresh: jest.fn(async () => {
          throw { status: 503 };
        }),
      },
    });
    await uncertainServerResponse.controller.restore();
    await uncertainServerResponse.controller.refresh();
    expect(uncertainServerResponse.controller.getState()).toMatchObject({
      status: "signed-out",
      profile: null,
    });
    expect(uncertainServerResponse.store.clear).toHaveBeenCalled();
  });

  test("dispose aborts an in-flight generation-scoped request", async () => {
    const started = deferred();
    let capturedSignal: AbortSignal | undefined;
    const profileFn = jest.fn(
      (_token: string, signal?: AbortSignal) =>
        new Promise<typeof profile>((resolve, reject) => {
          capturedSignal = signal;
          started.resolve();
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const f = fixture({
      store: { load: jest.fn(async () => pair) },
      api: { profile: profileFn },
    });
    const restoring = f.controller.restore();
    await started.promise;
    f.controller.dispose();
    await restoring;
    expect(capturedSignal?.aborted).toBe(true);
  });

  test("offers profile retry only after the new login pair was securely saved", async () => {
    const f = fixture({
      api: {
        profile: jest.fn(async () => {
          throw { status: 503 };
        }),
      },
    });
    const signIn = () =>
      f.controller.signIn(
        "kakao",
        "https://api.example/callback",
        "jamye://oauth/kakao",
      );
    await signIn();
    expect(f.controller.getState()).toMatchObject({
      status: "error",
      retryAction: "retryProfile",
    });

    f.api.exchange.mockRejectedValueOnce({ status: 503 });
    await signIn();
    expect(f.controller.getState().retryAction).toBeUndefined();

    f.api.exchange.mockResolvedValueOnce({
      ...pair,
      accessToken: "new-access",
    });
    f.store.save.mockRejectedValueOnce(new Error("locked"));
    await signIn();
    expect(f.controller.getState().retryAction).toBeUndefined();
    expect(f.api.profile).toHaveBeenCalledTimes(1);
  });
});
