import { createHealthApi } from "@/core/health/health-api";

const ready = {
  status: "ready",
  checks: {
    postgres: { status: "ready", required: true },
    redis: { status: "ready", required: true },
    minio: { status: "ready", required: true },
  },
};

describe("server health diagnostics", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  test("normalizes the origin and makes an unauthenticated liveness request", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ status: "live" }),
    });
    await expect(
      createHealthApi("https://API.EXAMPLE:443/").liveness(),
    ).resolves.toEqual({ status: "live" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example/health/live", {
      headers: { Accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
  });

  test("maps ready dependencies without establishing an authenticated account", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ready });
    await expect(
      createHealthApi("https://api.example").readiness(),
    ).resolves.toEqual({
      status: "ready",
      dependencies: ready.checks,
    });
  });

  test("treats 503 readiness as typed diagnosis, including degraded dependencies", async () => {
    const notReady = {
      status: "not_ready",
      checks: {
        ...ready.checks,
        redis: { status: "unavailable", required: true },
        minio: { status: "degraded", required: false },
      },
    };
    fetchMock.mockResolvedValue({ status: 503, json: async () => notReady });
    await expect(
      createHealthApi("https://api.example").readiness(),
    ).resolves.toEqual({
      status: "not_ready",
      dependencies: notReady.checks,
    });
  });

  test.each([
    { status: "unknown", checks: ready.checks },
    { status: "ready", checks: {} },
    {
      ...ready,
      checks: { ...ready.checks, redis: { status: "ready", required: "yes" } },
    },
  ])("rejects malformed readiness data %#", async (payload) => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => payload });
    await expect(
      createHealthApi("https://api.example").readiness(),
    ).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  test("maps only known fields while accepting extensions permitted by the contract", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ...ready, unexpected: true }),
    });
    await expect(
      createHealthApi("https://api.example").readiness(),
    ).resolves.toEqual({ status: "ready", dependencies: ready.checks });
  });

  test("rejects a malformed liveness body and invalid JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ status: "ready" }),
    });
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => {
        throw new SyntaxError("private body");
      },
    });
    const api = createHealthApi("https://api.example");
    await expect(api.liveness()).rejects.toMatchObject({
      code: "invalid_response",
    });
    await expect(api.liveness()).rejects.toMatchObject({
      code: "invalid_response",
      message: "invalid_response",
    });
  });

  test("rejects unexpected HTTP status without interpreting its body as health", async () => {
    const json = jest.fn();
    fetchMock.mockResolvedValue({ status: 502, json });
    await expect(
      createHealthApi("https://api.example").readiness(),
    ).rejects.toMatchObject({
      code: "http_error",
      status: 502,
    });
    expect(json).not.toHaveBeenCalled();
  });

  test("does not expose transport error details", async () => {
    fetchMock.mockRejectedValue(new Error("private transport detail"));
    await expect(
      createHealthApi("https://api.example").liveness(),
    ).rejects.toMatchObject({
      code: "network_unavailable",
      message: "network_unavailable",
    });
  });

  test("does not start a request already cancelled by its caller", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createHealthApi("https://api.example").liveness(controller.signal),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("preserves caller cancellation as distinct from a network failure", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const result = expect(
      createHealthApi("https://api.example").readiness(controller.signal),
    ).rejects.toMatchObject({ code: "cancelled" });
    controller.abort();
    await result;
  });

  test.each(["headers", "body"])(
    "times out stalled %s and releases its timer",
    async (phase) => {
      jest.useFakeTimers();
      fetchMock.mockImplementation((_url: string, init: RequestInit) => {
        const stalled = new Promise<never>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        });
        return phase === "headers"
          ? stalled
          : Promise.resolve({ status: 200, json: () => stalled });
      });
      const result = expect(
        createHealthApi("https://api.example").readiness(),
      ).rejects.toMatchObject({ code: "timeout" });
      await jest.advanceTimersByTimeAsync(15_000);
      await result;
      expect(jest.getTimerCount()).toBe(0);
    },
  );
});
