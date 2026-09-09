import { createAuthApi } from "@/core/auth/auth-api";
import { createAuthController } from "@/core/auth/auth-controller";

const origin = "https://api.example";
const state = "s".repeat(43);
const verifier = "v".repeat(43);
const pair = {
  access_token: "test-access",
  access_token_expires_at: "2030-01-01T00:00:00Z",
  refresh_token: "r".repeat(43),
  refresh_token_expires_at: "2031-01-01T00:00:00Z",
  token_type: "Bearer",
};

describe("connected OAuth wire flow", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test.each(["kakao", "google"] as const)(
    "%s keeps provider HTTPS redirect separate from the app return through profile and logout",
    async (provider) => {
      const providerCallback = `${origin}/api/v1/auth/oauth/${provider}/callback`;
      const appCallback = `jamye://oauth/${provider}`;
      const authorizationUrl =
        provider === "kakao"
          ? "https://kauth.kakao.com/oauth/authorize"
          : "https://accounts.google.com/o/oauth2/v2/auth";
      const fetchMock = jest.fn<
        ReturnType<typeof fetch>,
        [input: RequestInfo | URL, init?: RequestInit]
      >();
      globalThis.fetch = fetchMock;
      for (const payload of [
        {
          authorization_url: authorizationUrl,
          state,
          expires_in_seconds: 600,
        },
        pair,
        {
          id: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
          provider,
          nickname: "테스트 사용자",
          avatar_url: null,
          created_at: "2020-01-01T00:00:00Z",
        },
      ]) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => payload,
        } as Response);
      }
      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 } as Response);
      const openBrowser = jest.fn(async () => ({
        type: "success" as const,
        url: `${appCallback}?code=TEST_CODE&state=${state}`,
      }));
      const store = {
        load: jest.fn(async () => null),
        save: jest.fn(async () => undefined),
        clear: jest.fn(async () => undefined),
      };
      const controller = createAuthController({
        origin,
        api: createAuthApi(origin),
        store,
        openBrowser,
        createPkce: async () => ({ verifier, challenge: "c".repeat(43) }),
      });

      await controller.signIn(provider, providerCallback, appCallback);

      expect(openBrowser).toHaveBeenCalledWith(authorizationUrl, appCallback);
      const bodyAt = (index: number) =>
        JSON.parse(fetchMock.mock.calls[index][1]?.body as string);
      expect(bodyAt(0)).toMatchObject({
        redirect_uri: providerCallback,
        code_challenge_method: "S256",
      });
      expect(bodyAt(1)).toEqual({
        authorization_code: "TEST_CODE",
        state,
        code_verifier: verifier,
        redirect_uri: providerCallback,
      });
      expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
        Authorization: `Bearer ${pair.access_token}`,
      });
      expect(store.save).toHaveBeenCalledWith(
        origin,
        expect.objectContaining({
          accessToken: pair.access_token,
          refreshToken: pair.refresh_token,
        }),
      );
      expect(controller.getState()).toMatchObject({
        status: "signed-in",
        profile: { provider, nickname: "테스트 사용자" },
      });

      await controller.logout();

      expect(store.clear).toHaveBeenCalledTimes(1);
      expect(controller.getState().status).toBe("signed-out");
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        `${origin}/api/v1/auth/oauth/${provider}/authorize`,
        `${origin}/api/v1/auth/oauth/${provider}/exchange`,
        `${origin}/api/v1/me`,
        `${origin}/api/v1/auth/logout`,
      ]);
    },
  );
});
