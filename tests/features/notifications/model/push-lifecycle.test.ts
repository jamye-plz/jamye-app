import {
  createPushLifecycle,
  type PushInstallation,
  type PushInstallationsPort,
  type StartInput,
} from "@/features/notifications/model/push-lifecycle";

function fakeInstallation(
  overrides: Partial<PushInstallation> = {},
): PushInstallation {
  return {
    installationId: "device-1",
    platform: "ios",
    environment: "development",
    provider: "expo",
    messagePreviewEnabled: false,
    lastSeenAt: "2026-09-20T00:00:00.000Z",
    disabledAt: null,
    ...overrides,
  };
}

function createFakePort(): PushInstallationsPort & {
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
} {
  return {
    create: jest.fn(async () => fakeInstallation()),
    update: jest.fn(async () => fakeInstallation()),
    delete: jest.fn(async () => undefined),
  };
}

const baseStartInput: StartInput = {
  installationId: "device-1",
  platform: "ios",
  environment: "development",
  messagePreviewEnabled: false,
  permissionStatus: "granted",
  token: { ok: true, token: "expo-token-1" },
};

describe("push-lifecycle", () => {
  it("starts at idle", () => {
    const lifecycle = createPushLifecycle(createFakePort());
    expect(lifecycle.getState()).toEqual({ status: "idle" });
  });

  it("transitions idle -> checking -> registering -> registered on a successful create", async () => {
    const port = createFakePort();
    const lifecycle = createPushLifecycle(port);
    const observed: string[] = [];
    lifecycle.subscribe((state) => observed.push(state.status));

    await lifecycle.start(baseStartInput);

    expect(observed).toEqual(["checking", "registering", "registered"]);
    expect(lifecycle.getState()).toEqual({
      status: "registered",
      installation: fakeInstallation(),
    });
    expect(port.create).toHaveBeenCalledWith({
      installationId: "device-1",
      platform: "ios",
      environment: "development",
      expoToken: "expo-token-1",
      messagePreviewEnabled: false,
    });
  });

  it("degrades to disabled(permission_denied) without calling the port", async () => {
    const port = createFakePort();
    const lifecycle = createPushLifecycle(port);
    await lifecycle.start({ ...baseStartInput, permissionStatus: "denied" });
    const state = lifecycle.getState();
    expect(state.status).toBe("disabled");
    if (state.status === "disabled") {
      expect(state.reason).toBe("permission_denied");
      expect(state.message.length).toBeGreaterThan(0);
    }
    expect(port.create).not.toHaveBeenCalled();
  });

  it("degrades to disabled(missing_project_id) when the token resolution says so", async () => {
    const port = createFakePort();
    const lifecycle = createPushLifecycle(port);
    await lifecycle.start({
      ...baseStartInput,
      token: { ok: false, reason: "missing_project_id" },
    });
    expect(lifecycle.getState()).toMatchObject({
      status: "disabled",
      reason: "missing_project_id",
    });
    expect(port.create).not.toHaveBeenCalled();
  });

  it("degrades to disabled(not_physical_device) when the token resolution says so", async () => {
    const port = createFakePort();
    const lifecycle = createPushLifecycle(port);
    await lifecycle.start({
      ...baseStartInput,
      token: { ok: false, reason: "not_physical_device" },
    });
    expect(lifecycle.getState()).toMatchObject({
      status: "disabled",
      reason: "not_physical_device",
    });
  });

  it("never throws on permission denial; it surfaces as a state", async () => {
    const port = createFakePort();
    const lifecycle = createPushLifecycle(port);
    await expect(
      lifecycle.start({ ...baseStartInput, permissionStatus: "undetermined" }),
    ).resolves.toBeUndefined();
    expect(lifecycle.getState().status).toBe("disabled");
  });

  it("moves to an error state (not disabled) when create() rejects", async () => {
    const port = createFakePort();
    port.create.mockRejectedValueOnce(new Error("network"));
    const lifecycle = createPushLifecycle(port);
    await lifecycle.start(baseStartInput);
    const state = lifecycle.getState();
    expect(state.status).toBe("error");
    if (state.status === "error")
      expect(state.message.length).toBeGreaterThan(0);
  });

  describe("stale re-registration (disabled_at on the P2 response)", () => {
    it("re-registers once and recovers to registered when the retry is clean", async () => {
      const port = createFakePort();
      port.create
        .mockResolvedValueOnce(
          fakeInstallation({ disabledAt: "2026-09-20T00:00:00.000Z" }),
        )
        .mockResolvedValueOnce(fakeInstallation({ disabledAt: null }));
      const lifecycle = createPushLifecycle(port);
      const observed: string[] = [];
      lifecycle.subscribe((state) => observed.push(state.status));

      await lifecycle.start(baseStartInput);

      expect(observed).toEqual([
        "checking",
        "registering",
        "stale",
        "registered",
      ]);
      expect(port.create).toHaveBeenCalledTimes(2);
      expect(lifecycle.getState()).toEqual({
        status: "registered",
        installation: fakeInstallation({ disabledAt: null }),
      });
    });

    it("stops at stale_unrecoverable after exactly one retry when still disabled", async () => {
      const port = createFakePort();
      port.create.mockResolvedValue(
        fakeInstallation({ disabledAt: "2026-09-20T00:00:00.000Z" }),
      );
      const lifecycle = createPushLifecycle(port);
      const observed: string[] = [];
      lifecycle.subscribe((state) => observed.push(state.status));

      await lifecycle.start(baseStartInput);

      expect(observed).toEqual([
        "checking",
        "registering",
        "stale",
        "stale_unrecoverable",
      ]);
      expect(port.create).toHaveBeenCalledTimes(2);
      const state = lifecycle.getState();
      expect(state.status).toBe("stale_unrecoverable");
      if (state.status === "stale_unrecoverable")
        expect(state.message.length).toBeGreaterThan(0);
    });
  });

  describe("token rotation (P3)", () => {
    it("rotateToken drives update() while registered: registered -> rotating -> registered", async () => {
      const port = createFakePort();
      port.update.mockResolvedValueOnce(
        fakeInstallation({ disabledAt: null, environment: "development" }),
      );
      const lifecycle = createPushLifecycle(port);
      await lifecycle.start(baseStartInput);

      const observed: string[] = [];
      lifecycle.subscribe((state) => observed.push(state.status));
      await lifecycle.rotateToken("expo-token-2");

      expect(observed).toEqual(["rotating", "registered"]);
      expect(port.update).toHaveBeenCalledWith("device-1", {
        expoToken: "expo-token-2",
      });
    });

    it("is a no-op when called before any registration", async () => {
      const port = createFakePort();
      const lifecycle = createPushLifecycle(port);
      await lifecycle.rotateToken("expo-token-2");
      expect(port.update).not.toHaveBeenCalled();
      expect(lifecycle.getState()).toEqual({ status: "idle" });
    });

    it("re-registers via create() when the P3 rotation response is stale, reusing the rotated token", async () => {
      const port = createFakePort();
      port.update.mockResolvedValueOnce(
        fakeInstallation({ disabledAt: "2026-09-20T00:00:00.000Z" }),
      );
      port.create.mockResolvedValueOnce(fakeInstallation({ disabledAt: null }));
      const lifecycle = createPushLifecycle(port);
      await lifecycle.start(baseStartInput);
      await lifecycle.rotateToken("expo-token-2");

      expect(port.create).toHaveBeenLastCalledWith({
        installationId: "device-1",
        platform: "ios",
        environment: "development",
        expoToken: "expo-token-2",
        messagePreviewEnabled: false,
      });
      expect(lifecycle.getState()).toEqual({
        status: "registered",
        installation: fakeInstallation({ disabledAt: null }),
      });
    });
  });

  describe("preview toggle (P3)", () => {
    it("setMessagePreviewEnabled drives update() with the flag", async () => {
      const port = createFakePort();
      port.update.mockResolvedValueOnce(
        fakeInstallation({ disabledAt: null, messagePreviewEnabled: true }),
      );
      const lifecycle = createPushLifecycle(port);
      await lifecycle.start(baseStartInput);
      await lifecycle.setMessagePreviewEnabled(true);

      expect(port.update).toHaveBeenCalledWith("device-1", {
        messagePreviewEnabled: true,
      });
      expect(lifecycle.getState()).toEqual({
        status: "registered",
        installation: fakeInstallation({
          disabledAt: null,
          messagePreviewEnabled: true,
        }),
      });
    });

    it("re-registers using the last known good token when a preview-only update goes stale", async () => {
      const port = createFakePort();
      port.update.mockResolvedValueOnce(
        fakeInstallation({ disabledAt: "2026-09-20T00:00:00.000Z" }),
      );
      port.create.mockResolvedValueOnce(
        fakeInstallation({ disabledAt: null, messagePreviewEnabled: true }),
      );
      const lifecycle = createPushLifecycle(port);
      await lifecycle.start(baseStartInput);
      await lifecycle.setMessagePreviewEnabled(true);

      expect(port.create).toHaveBeenLastCalledWith({
        installationId: "device-1",
        platform: "ios",
        environment: "development",
        expoToken: "expo-token-1",
        messagePreviewEnabled: true,
      });
    });
  });

  describe("teardown (P4)", () => {
    it("registered -> deleting -> deleted, calling delete() with the installation id", async () => {
      const port = createFakePort();
      const lifecycle = createPushLifecycle(port);
      await lifecycle.start(baseStartInput);

      const observed: string[] = [];
      lifecycle.subscribe((state) => observed.push(state.status));
      await lifecycle.teardown();

      expect(observed).toEqual(["deleting", "deleted"]);
      expect(port.delete).toHaveBeenCalledWith("device-1");
      expect(lifecycle.getState()).toEqual({ status: "deleted" });
    });

    it("is a true no-op when never registered: no port call, no state change", async () => {
      const port = createFakePort();
      const lifecycle = createPushLifecycle(port);
      const observed: string[] = [];
      lifecycle.subscribe((state) => observed.push(state.status));

      await lifecycle.teardown();

      expect(observed).toEqual([]);
      expect(port.delete).not.toHaveBeenCalled();
      expect(lifecycle.getState()).toEqual({ status: "idle" });
    });

    it("still reaches deleted on a best-effort basis when delete() rejects (does not block logout)", async () => {
      const port = createFakePort();
      port.delete.mockRejectedValueOnce(new Error("timeout"));
      const lifecycle = createPushLifecycle(port);
      await lifecycle.start(baseStartInput);
      await expect(lifecycle.teardown()).resolves.toBeUndefined();
      expect(lifecycle.getState()).toEqual({ status: "deleted" });
    });
  });

  describe("account switch ordering", () => {
    it("orders P4 (delete) before P2 (create) and reuses the same installation_id, with no duplicate active installation", async () => {
      const port = createFakePort();
      const lifecycle = createPushLifecycle(port);

      await lifecycle.start(baseStartInput); // account A registers
      await lifecycle.teardown(); // account A logs out (P4)
      await lifecycle.start({
        ...baseStartInput,
        token: { ok: true, token: "expo-token-account-b" },
      }); // account B logs in on the same device (P2)

      expect(port.delete).toHaveBeenCalledTimes(1);
      expect(port.create).toHaveBeenCalledTimes(2);
      const deleteOrder = port.delete.mock.invocationCallOrder[0];
      const secondCreateOrder = port.create.mock.invocationCallOrder[1];
      expect(deleteOrder).toBeLessThan(secondCreateOrder);
      expect(port.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ installationId: "device-1" }),
      );
      expect(lifecycle.getState()).toEqual({
        status: "registered",
        installation: fakeInstallation(),
      });
    });
  });
});
