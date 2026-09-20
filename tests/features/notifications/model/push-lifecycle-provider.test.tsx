import { act, render, waitFor } from "@testing-library/react-native";
import React, { useEffect } from "react";

import {
  PushLifecycleProvider,
  usePushLifecycle,
} from "@/features/notifications/model/push-lifecycle-provider";
import type { PushLifecycleContextValue } from "@/features/notifications/model/push-lifecycle-provider";
import type { PushInstallation } from "@/features/notifications/model/push-lifecycle";

type Principal = Readonly<{ origin: string; userId: string; epoch: number }>;

let mockPrincipal: Principal | null = null;
const mockAuthorizedRequest = jest.fn(
  (execute: (accessToken: string, signal: AbortSignal) => Promise<unknown>) =>
    execute("access-token", new AbortController().signal),
);

jest.mock("@/core/providers/session-provider", () => ({
  useSession: jest.fn(() => ({
    authorizedRequest: mockAuthorizedRequest,
    principal: mockPrincipal,
  })),
}));

function fakeInstallation(
  overrides: Partial<PushInstallation> = {},
): PushInstallation {
  return {
    disabledAt: null,
    environment: "development",
    installationId: "device-shared",
    lastSeenAt: "2024-01-01T00:00:00Z",
    messagePreviewEnabled: false,
    platform: "ios",
    provider: "expo",
    ...overrides,
  };
}

function createFakeHttpPort(overrides: Record<string, jest.Mock> = {}) {
  return {
    create: jest.fn().mockResolvedValue(fakeInstallation()),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(fakeInstallation()),
    ...overrides,
  };
}

function createFakeAdapter(overrides: Record<string, jest.Mock> = {}) {
  return {
    getExpoPushToken: jest
      .fn()
      .mockResolvedValue({ ok: true, token: "ExponentPushToken[token-1]" }),
    getPermissions: jest.fn().mockResolvedValue("granted"),
    onTokenChanged: jest.fn(() => () => undefined),
    requestPermissions: jest.fn().mockResolvedValue("granted"),
    ...overrides,
  };
}

function createFakeIdStore(id = "device-shared") {
  return { getOrCreate: jest.fn().mockResolvedValue(id) };
}

function createFakePreferenceStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

let latest: PushLifecycleContextValue | undefined;
function Probe({
  onValue,
}: {
  onValue: (value: PushLifecycleContextValue) => void;
}) {
  const value = usePushLifecycle();
  useEffect(() => {
    onValue(value);
  }, [value, onValue]);
  return null;
}

type ProviderProps = Partial<
  Omit<Parameters<typeof PushLifecycleProvider>[0], "children">
>;

function buildProviderJsx(props: ProviderProps) {
  return (
    <PushLifecycleProvider origin="https://api.example" {...props}>
      <Probe
        onValue={(value) => {
          latest = value;
        }}
      />
    </PushLifecycleProvider>
  );
}

function renderProvider(props: ProviderProps = {}) {
  return render(buildProviderJsx(props));
}

describe("push-lifecycle-provider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrincipal = null;
    latest = undefined;
  });

  describe("environment mapping (r2)", () => {
    it.each([
      [undefined, "development"],
      ["development", "development"],
      ["production", "production"],
    ] as const)(
      "maps extra.appVariant %p to P2 body.environment %p",
      async (appVariant, expected) => {
        mockPrincipal = {
          epoch: 1,
          origin: "https://api.example",
          userId: "user-a",
        };
        const httpPort = createFakeHttpPort();
        await renderProvider({
          adapter: createFakeAdapter(),
          appVariant,
          createHttpPort: () => httpPort,
          installationIdStore: createFakeIdStore(),
          preferenceStore: createFakePreferenceStore(),
          projectId: "project-1",
        });

        await waitFor(() => expect(httpPort.create).toHaveBeenCalledTimes(1));
        expect(httpPort.create.mock.calls[0][1]).toEqual(
          expect.objectContaining({ environment: expected }),
        );
      },
    );
  });

  describe("account switch sequencing", () => {
    it("tears down (P4) before re-registering (P2) with the same device-scoped installation id", async () => {
      mockPrincipal = {
        epoch: 1,
        origin: "https://api.example",
        userId: "user-a",
      };
      const httpPort = createFakeHttpPort();
      const idStore = createFakeIdStore("device-shared");
      const commonProps: ProviderProps = {
        adapter: createFakeAdapter(),
        appVariant: "development",
        createHttpPort: () => httpPort,
        installationIdStore: idStore,
        preferenceStore: createFakePreferenceStore(),
        projectId: "project-1",
      };
      const screen = await renderProvider(commonProps);

      await waitFor(() => expect(httpPort.create).toHaveBeenCalledTimes(1));

      await act(async () => {
        await latest?.disable();
      });
      expect(httpPort.remove).toHaveBeenCalledTimes(1);
      expect(httpPort.create).toHaveBeenCalledTimes(1);

      mockPrincipal = {
        epoch: 2,
        origin: "https://api.example",
        userId: "user-b",
      };
      // A re-render is required for the effect watching principal.userId to
      // observe the switched account (mutating the mock alone doesn't
      // re-render the already-mounted tree).
      await act(async () => {
        await screen.rerender(buildProviderJsx(commonProps));
      });

      await waitFor(() => expect(httpPort.create).toHaveBeenCalledTimes(2));
      expect(idStore.getOrCreate).toHaveBeenCalledTimes(2);
      expect(httpPort.create.mock.calls[0][1].installationId).toBe(
        "device-shared",
      );
      expect(httpPort.create.mock.calls[1][1].installationId).toBe(
        "device-shared",
      );
      expect(httpPort.remove.mock.invocationCallOrder[0]).toBeLessThan(
        httpPort.create.mock.invocationCallOrder[1],
      );
    });
  });

  describe("token rotation -> P3", () => {
    it("rotates the token via update() when the adapter reports a device token change", async () => {
      mockPrincipal = {
        epoch: 1,
        origin: "https://api.example",
        userId: "user-a",
      };
      const httpPort = createFakeHttpPort();
      let tokenChangeListener: (() => void) | undefined;
      const adapter = createFakeAdapter({
        getExpoPushToken: jest
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            token: "ExponentPushToken[token-1]",
          })
          .mockResolvedValueOnce({
            ok: true,
            token: "ExponentPushToken[token-2]",
          }),
        onTokenChanged: jest.fn((listener: () => void) => {
          tokenChangeListener = listener;
          return () => undefined;
        }),
      });
      await renderProvider({
        adapter,
        appVariant: "development",
        createHttpPort: () => httpPort,
        installationIdStore: createFakeIdStore(),
        preferenceStore: createFakePreferenceStore(),
        projectId: "project-1",
      });

      await waitFor(() => expect(httpPort.create).toHaveBeenCalledTimes(1));

      await act(async () => {
        tokenChangeListener?.();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => expect(httpPort.update).toHaveBeenCalledTimes(1));
      expect(httpPort.update.mock.calls[0][2]).toEqual(
        expect.objectContaining({ expoToken: "ExponentPushToken[token-2]" }),
      );
    });
  });

  describe("message preview toggle -> P3", () => {
    it("persists the preference and updates the server once registered", async () => {
      mockPrincipal = {
        epoch: 1,
        origin: "https://api.example",
        userId: "user-a",
      };
      const httpPort = createFakeHttpPort();
      const preferenceStore = createFakePreferenceStore();
      await renderProvider({
        adapter: createFakeAdapter(),
        appVariant: "development",
        createHttpPort: () => httpPort,
        installationIdStore: createFakeIdStore(),
        preferenceStore,
        projectId: "project-1",
      });

      await waitFor(() => expect(httpPort.create).toHaveBeenCalledTimes(1));

      await act(async () => {
        await latest?.setMessagePreview(true);
      });

      expect(preferenceStore.setItemAsync).toHaveBeenCalledWith(
        expect.stringContaining("message-preview"),
        "true",
      );
      expect(httpPort.update).toHaveBeenCalledTimes(1);
      expect(httpPort.update.mock.calls[0][2]).toEqual(
        expect.objectContaining({ messagePreviewEnabled: true }),
      );
    });

    it("is a no-op against the server before any installation is registered", async () => {
      const httpPort = createFakeHttpPort();
      const preferenceStore = createFakePreferenceStore();
      await renderProvider({
        adapter: createFakeAdapter(),
        createHttpPort: () => httpPort,
        installationIdStore: createFakeIdStore(),
        preferenceStore,
        projectId: "project-1",
      });

      await act(async () => {
        await latest?.setMessagePreview(true);
      });

      expect(preferenceStore.setItemAsync).toHaveBeenCalledWith(
        expect.stringContaining("message-preview"),
        "true",
      );
      expect(httpPort.update).not.toHaveBeenCalled();
    });
  });

  describe("disabled/degraded diagnostics never throw", () => {
    it("surfaces permission_denied as a disabled state instead of registering", async () => {
      mockPrincipal = {
        epoch: 1,
        origin: "https://api.example",
        userId: "user-a",
      };
      const httpPort = createFakeHttpPort();
      await renderProvider({
        adapter: createFakeAdapter({
          getPermissions: jest.fn().mockResolvedValue("denied"),
        }),
        createHttpPort: () => httpPort,
        installationIdStore: createFakeIdStore(),
        preferenceStore: createFakePreferenceStore(),
        projectId: "project-1",
      });

      await waitFor(() => expect(latest?.state.status).toBe("disabled"));
      expect(httpPort.create).not.toHaveBeenCalled();
    });

    it("surfaces missing_project_id as a disabled state when no projectId is configured", async () => {
      mockPrincipal = {
        epoch: 1,
        origin: "https://api.example",
        userId: "user-a",
      };
      const httpPort = createFakeHttpPort();
      await renderProvider({
        adapter: createFakeAdapter(),
        createHttpPort: () => httpPort,
        installationIdStore: createFakeIdStore(),
        preferenceStore: createFakePreferenceStore(),
        projectId: null,
      });

      await waitFor(() =>
        expect(latest?.state).toEqual(
          expect.objectContaining({
            reason: "missing_project_id",
            status: "disabled",
          }),
        ),
      );
      expect(httpPort.create).not.toHaveBeenCalled();
    });

    it("tears down (P4) when the principal disappears without an explicit disable()", async () => {
      mockPrincipal = {
        epoch: 1,
        origin: "https://api.example",
        userId: "user-a",
      };
      const httpPort = createFakeHttpPort();
      const props = {
        adapter: createFakeAdapter(),
        createHttpPort: () => httpPort,
        installationIdStore: createFakeIdStore(),
        preferenceStore: createFakePreferenceStore(),
        projectId: "project-1",
      };
      const screen = await renderProvider(props);
      await waitFor(() => expect(latest?.state.status).toBe("registered"));

      mockPrincipal = null;
      await act(async () => {
        screen.rerender(buildProviderJsx(props));
      });

      await waitFor(() => expect(latest?.state.status).toBe("deleted"));
      expect(httpPort.remove).toHaveBeenCalledWith(
        "access-token",
        "device-shared",
        expect.anything(),
      );
    });

    it("surfaces an installation-id storage failure as an error state instead of an unhandled rejection", async () => {
      mockPrincipal = {
        epoch: 1,
        origin: "https://api.example",
        userId: "user-a",
      };
      const httpPort = createFakeHttpPort();
      await renderProvider({
        adapter: createFakeAdapter(),
        createHttpPort: () => httpPort,
        installationIdStore: {
          getOrCreate: jest
            .fn()
            .mockRejectedValue(new Error("keychain unavailable")),
        },
        preferenceStore: createFakePreferenceStore(),
        projectId: "project-1",
      });

      await waitFor(() => expect(latest?.state.status).toBe("error"));
      expect(latest?.state).toEqual(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(httpPort.create).not.toHaveBeenCalled();
    });

    it("surfaces a token-rotation lookup failure as an error state after registration", async () => {
      mockPrincipal = {
        epoch: 1,
        origin: "https://api.example",
        userId: "user-a",
      };
      let tokenListener: (() => void) | undefined;
      const httpPort = createFakeHttpPort();
      await renderProvider({
        adapter: createFakeAdapter({
          getExpoPushToken: jest
            .fn()
            .mockResolvedValueOnce({
              ok: true,
              token: "ExponentPushToken[token-1]",
            })
            .mockRejectedValueOnce(new Error("native module down")),
          onTokenChanged: jest.fn((listener: () => void) => {
            tokenListener = listener;
            return () => undefined;
          }),
        }),
        createHttpPort: () => httpPort,
        installationIdStore: createFakeIdStore(),
        preferenceStore: createFakePreferenceStore(),
        projectId: "project-1",
      });

      await waitFor(() => expect(latest?.state.status).toBe("registered"));
      expect(tokenListener).toBeDefined();
      await act(async () => {
        tokenListener?.();
      });

      await waitFor(() => expect(latest?.state.status).toBe("error"));
      expect(httpPort.update).not.toHaveBeenCalled();
    });
  });
});
