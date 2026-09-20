import { createPushInstallationsApi } from "@/features/notifications/data/push-installations-api";

const installationId = "installation-1";
const expoToken = "ExponentPushToken[abc123]";

const pushInstallationWire = {
  disabled_at: null,
  environment: "development",
  installation_id: installationId,
  last_seen_at: "2026-09-16T00:00:00Z",
  message_preview_enabled: false,
  platform: "ios",
  provider: "expo",
};

const createInput = {
  environment: "development" as const,
  expoToken,
  installationId,
  platform: "ios" as const,
};

describe("M12 push installations transport", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  const api = createPushInstallationsApi("https://api.example.com/");
  const reply = (
    status: number,
    value: unknown = null,
    retryAfter: string | null = null,
  ) => {
    const json = jest.fn().mockResolvedValue(value);
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json,
      headers: { get: () => retryAfter },
    });
    return json;
  };
  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test.each([200, 201])(
    "P2 create() accepts %s and maps the PushInstallation response",
    async (status) => {
      reply(status, pushInstallationWire);
      await expect(api.create("t", createInput)).resolves.toEqual({
        disabledAt: null,
        environment: "development",
        installationId,
        lastSeenAt: "2026-09-16T00:00:00Z",
        messagePreviewEnabled: false,
        platform: "ios",
        provider: "expo",
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.example.com/api/v1/push/installations");
      expect(init).toEqual(
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            environment: "development",
            expo_token: expoToken,
            installation_id: installationId,
            message_preview_enabled: false,
            platform: "ios",
          }),
        }),
      );
    },
  );

  test("P2 create() rejects an unsupported platform before the network call", async () => {
    await expect(
      api.create("t", { ...createInput, platform: "windows" as never }),
    ).rejects.toMatchObject({ code: "invalid_platform", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("P2 create() rejects an unsupported environment before the network call", async () => {
    await expect(
      api.create("t", { ...createInput, environment: "staging" as never }),
    ).rejects.toMatchObject({ code: "invalid_environment", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("P2 create() rejects installation_id over 255 chars before the network call", async () => {
    await expect(
      api.create("t", { ...createInput, installationId: "x".repeat(256) }),
    ).rejects.toMatchObject({ code: "invalid_installation_id", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("P2 create() rejects expo_token over 512 chars before the network call", async () => {
    await expect(
      api.create("t", { ...createInput, expoToken: "x".repeat(513) }),
    ).rejects.toMatchObject({ code: "invalid_expo_token", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("P2 create() rejects an empty installation_id/expo_token before the network call", async () => {
    await expect(
      api.create("t", { ...createInput, installationId: "" }),
    ).rejects.toMatchObject({ code: "invalid_installation_id", status: 422 });
    await expect(
      api.create("t", { ...createInput, expoToken: "" }),
    ).rejects.toMatchObject({ code: "invalid_expo_token", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("P3 update() sends PUT and maps the PushInstallation response", async () => {
    reply(200, { ...pushInstallationWire, message_preview_enabled: true });
    await expect(
      api.update("t", installationId, {
        expoToken,
        messagePreviewEnabled: true,
      }),
    ).resolves.toMatchObject({ messagePreviewEnabled: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.example.com/api/v1/push/installations/${installationId}`,
    );
    expect(init).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          expo_token: expoToken,
          message_preview_enabled: true,
        }),
      }),
    );
  });

  test("P3 update() rejects an over-length expo_token before the network call", async () => {
    await expect(
      api.update("t", installationId, { expoToken: "x".repeat(513) }),
    ).rejects.toMatchObject({ code: "invalid_expo_token", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("P4 remove() sends DELETE and resolves on 204", async () => {
    reply(204, null);
    await expect(api.remove("t", installationId)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.example.com/api/v1/push/installations/${installationId}`,
    );
    expect(init).toEqual(expect.objectContaining({ method: "DELETE" }));
  });

  test("remove() rejects an out-of-range installation_id locally, without a network call", async () => {
    await expect(api.remove("t", "")).rejects.toMatchObject({
      code: "invalid_installation_id",
      status: 422,
    });
    await expect(api.remove("t", "x".repeat(256))).rejects.toMatchObject({
      code: "invalid_installation_id",
      status: 422,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("create() surfaces a malformed 201 response as invalid_installation_response", async () => {
    reply(201, { ...pushInstallationWire, provider: "fcm" });
    await expect(api.create("t", createInput)).rejects.toMatchObject({
      code: "invalid_installation_response",
      status: 502,
    });
  });

  test("update()/remove() surface a 404 as the generic request_failed passthrough (no notification-specific remap here)", async () => {
    reply(404, null);
    await expect(
      api.update("t", installationId, { expoToken }),
    ).rejects.toMatchObject({ code: "request_failed", status: 404 });
  });
});
