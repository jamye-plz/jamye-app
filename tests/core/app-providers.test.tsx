import type { ColorValue } from "react-native";
import { act, render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";
import { Text, useColorScheme } from "react-native";
import {
  PRINCIPAL,
  CHATROOM_ID,
  pendingEnqueueResult,
  fakeChatApi,
  fakeConnectedChatRepository,
  wireHistoryMessage,
} from "../features/chat/model/connected-chat-fixtures";
import type { AccountSyncDependencies } from "@/features/sync/model/account-sync";
import type { AuthorizedChatRequest } from "@/features/chat/model/connected-chat-store";

// M12: `PushTapHandoffListener` (mounted inside the connected provider tree)
// navigates through expo-router; keep the real router out of this composition
// test the same way the screen tests do.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("react-native-keyboard-controller", () => {
  const mockReact = jest.requireActual<typeof import("react")>("react");

  return {
    KeyboardProvider: ({ children }: { children: unknown }) =>
      mockReact.createElement(mockReact.Fragment, null, children as never),
  };
});

describe("M9 production sync composition", () => {
  function setupSync() {
    const runtimeModule = jest.requireActual<
      typeof import("@/features/sync/model/account-sync")
    >("@/features/sync/model/account-sync");
    let dependencies: AccountSyncDependencies | undefined;
    jest
      .spyOn(runtimeModule, "createAccountSync")
      .mockImplementation((input) => {
        dependencies = input;
        return {
          start: jest.fn(),
          wake: jest.fn(),
          setConversations: jest.fn(),
          pause: jest.fn(),
          resume: jest.fn(),
          dispose: jest.fn(),
        };
      });
    const chatApiModule = jest.requireActual<
      typeof import("@/features/chat/data/chat-api")
    >("@/features/chat/data/chat-api");
    const syncApiModule = jest.requireActual<
      typeof import("@/features/sync/realtime/sync-api")
    >("@/features/sync/realtime/sync-api");
    const api = fakeChatApi();
    const syncApi = {
      listEvents: jest.fn().mockResolvedValue({ items: [], next_cursor: null }),
      issueTicket: jest.fn().mockResolvedValue({
        ticket: "one-time",
        expires_at: "2026-09-10T00:00:30Z",
        contract_version: "1",
      }),
    };
    jest.spyOn(chatApiModule, "createChatApi").mockReturnValue(api);
    jest.spyOn(syncApiModule, "createSyncApi").mockReturnValue(syncApi);
    const repository = fakeConnectedChatRepository();
    const authorizeCalls = jest.fn();
    const authorize: AuthorizedChatRequest = async (run, signal) => {
      authorizeCalls();
      return run("authorized", signal ?? new AbortController().signal);
    };
    const binding = {
      principal: PRINCIPAL,
      repository,
      isActive: jest.fn(() => true),
      onChanged: jest.fn(async () => undefined),
      onState: jest.fn(),
      authorize,
    };
    const providers = jest.requireActual<
      typeof import("@/core/providers/app-providers")
    >("@/core/providers/app-providers");
    providers.createConnectedAccountSync(binding);
    if (!dependencies)
      throw new Error("Production composition did not create account sync.");
    return { dependencies, binding, api, syncApi, repository, authorizeCalls };
  }

  afterEach(() => jest.restoreAllMocks());

  test("C4/S1/R1 use the existing authorization boundary and C4 preserves server identity for validation", async () => {
    const f = setupSync();
    expect(f.api.sendChatMessage).not.toHaveBeenCalled();
    const signal = new AbortController().signal;
    const command = {
      ...pendingEnqueueResult().command,
      attemptCount: 1,
      leaseToken: "lease",
      leaseExpiresAtMs: 30000,
      nextAttemptAtMs: 0,
    };
    const message = wireHistoryMessage({
      clientMessageId: "server-response-identity",
    });
    f.api.sendChatMessage.mockResolvedValue({ status: 200, message });
    const merged = await f.dependencies.send(command, signal);
    expect(f.api.sendChatMessage).toHaveBeenCalledWith(
      "authorized",
      CHATROOM_ID,
      { body: command.body, clientMessageId: command.clientMsgId },
      signal,
    );
    expect(merged.clientMsgId).toBe("server-response-identity");
    expect(merged.localId).toBe(command.localId);
    await f.dependencies.listEvents(CHATROOM_ID, "opaque-checkpoint", signal);
    expect(f.syncApi.listEvents).toHaveBeenCalledWith(
      "authorized",
      CHATROOM_ID,
      { after: "opaque-checkpoint", limit: 100 },
      signal,
    );
    const ticket = await f.dependencies.issueTicket(signal);
    expect(f.dependencies.socketUrl(ticket)).toContain("ticket=one-time");
    expect(f.authorizeCalls).toHaveBeenCalledTimes(3);
  });

  test("M11 dispatcher sends the stored attachment order without minting another identity", async () => {
    const f = setupSync();
    const mediaUploadIds = [
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
    ];
    const command = {
      ...pendingEnqueueResult({ body: "" }).command,
      mediaUploadIds,
      attemptCount: 2,
      leaseToken: "lease",
      leaseExpiresAtMs: 30000,
      nextAttemptAtMs: 0,
    };
    f.api.sendChatMessage.mockResolvedValue({
      status: 200,
      message: wireHistoryMessage(),
    });
    const signal = new AbortController().signal;
    await f.dependencies.send(command, signal);
    expect(f.api.sendChatMessage).toHaveBeenCalledWith(
      "authorized",
      CHATROOM_ID,
      {
        body: "",
        clientMessageId: command.clientMsgId,
        mediaUploadIds,
      },
      signal,
    );
  });

  test("C2 reconciliation is bounded, continues later, and only reports complete at pagination exhaustion", async () => {
    const f = setupSync();
    f.repository.listDirtyReconciliationScopes.mockResolvedValue([
      { scope: "chat_history", markerEventId: "marker" },
    ]);
    let page = 0;
    f.api.listChatroomMessages.mockImplementation(async () => ({
      items: [wireHistoryMessage()],
      nextCursor: `page-${++page}`,
    }));
    const signal = new AbortController().signal;
    expect(
      (await f.dependencies.refreshHistory(CHATROOM_ID, signal)).complete,
    ).toBe(false);
    expect(f.api.listChatroomMessages).toHaveBeenCalledTimes(10);
    expect(f.repository.mergeHistoryMessages).toHaveBeenCalledTimes(10);
    f.api.listChatroomMessages.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });
    expect(await f.dependencies.refreshHistory(CHATROOM_ID, signal)).toEqual({
      complete: true,
      messages: [],
    });
    expect(f.api.listChatroomMessages).toHaveBeenLastCalledWith(
      "authorized",
      CHATROOM_ID,
      { before: "page-10", limit: 100 },
      signal,
    );
    expect(f.repository.reconcileChatHistory).not.toHaveBeenCalled();
  });
});

type AppTheme = Readonly<{
  colorScheme: "light" | "dark";
  colors: Readonly<{
    background: ColorValue;
    text: ColorValue;
    primary: ColorValue;
    onPrimary: ColorValue;
  }>;
}>;
type ClockPort = Readonly<{ nowMs: () => number }>;
type MessageIdentityPort = Readonly<{
  next: () => Readonly<{ clientMsgId: string; localId: string }>;
}>;
type DatabaseRepository = Readonly<{
  ensureFixtureConversation: (fixture: unknown) => Promise<void>;
  label: string;
}>;
type DatabaseResource = Readonly<{
  close: () => Promise<void>;
  repository: DatabaseRepository;
}>;
type DatabaseProviderFactory = () => Promise<DatabaseResource>;
type FileSystemModule = Readonly<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>;
type AppRuntimeDependencies = Readonly<{
  clock: ClockPort;
  messageIdentity: MessageIdentityPort;
  repository: DatabaseRepository;
}>;
type AuthState = Readonly<{
  status: "loading" | "signed-out" | "signing-in" | "signed-in" | "error";
  profile: Readonly<{
    id: string;
    provider: string;
    nickname: string;
    avatarUrl: string | null;
    createdAt: string;
  }> | null;
  message: string | null;
  retryAction?: "restore" | "retryProfile" | "logout";
}>;
type AuthController = Readonly<{
  getState: () => AuthState;
  getGeneration: () => number;
  subscribe: (listener: (value: AuthState) => void) => () => void;
  dispose: () => void;
  restore: (signal?: AbortSignal) => Promise<void>;
  signIn: (
    provider: string,
    redirectUri: string,
    returnUri: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  logout: (signal?: AbortSignal) => Promise<void>;
  retryProfile: (signal?: AbortSignal) => Promise<void>;
}>;
type AccountScopeRenderedState =
  | null
  | Readonly<{ status: "opening" }>
  | Readonly<{ database: unknown; status: "ready" }>
  | Readonly<{ error: Error; status: "error" }>;
type AccountScopeController = Readonly<{
  getState: () => AccountScopeRenderedState;
  setPrincipal: (
    principal: Readonly<{
      origin: string;
      userId: string;
      epoch: number;
    }> | null,
  ) => void;
  subscribe: (listener: () => void) => () => void;
}>;
type AppProvidersProps = Readonly<{
  children: ReactNode;
  clockFactory?: () => ClockPort;
  databaseFactory?: DatabaseProviderFactory;
  messageIdentityFactory?: () => MessageIdentityPort;
  createSessionController?: (origin: string) => AuthController;
  createAccountScope?: () => AccountScopeController;
}>;
type ProvidersModule = {
  AppProviders?: unknown;
  useAppRuntime?: unknown;
  useAccountScope?: unknown;
};
type ThemeModule = { useAppTheme?: unknown };
type UseAppTheme = () => AppTheme;
type UseAppRuntime = () => AppRuntimeDependencies;
type AccountScopeContextValue = Readonly<{
  state: AccountScopeRenderedState;
  retry: () => void;
}>;
type UseAccountScope = () => AccountScopeContextValue;

// Background/text are platform semantic colors (PlatformColor objects) since
// T1a of the native UI refactor, identical across schemes; the Berry accent is
// the scheme-specific literal that proves which theme was selected.
const EXPECTED_THEMES = [
  {
    colorScheme: "light" as const,
    primary: "#9B3F68",
    onPrimary: "#FFFFFF",
  },
  {
    colorScheme: "dark" as const,
    primary: "#E39BB8",
    onPrimary: "#2C141F",
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error.code === "MODULE_NOT_FOUND" ||
    (typeof error.message === "string" &&
      error.message.includes("Cannot find module"))
  );
}

function loadRequiredModule<T extends object>(
  modulePath: string,
  implementationPath: string,
): T {
  try {
    return jest.requireActual<T>(modulePath);
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        `M3-I3 implementation missing: ${implementationPath} must exist before GREEN.`,
      );
    }
    throw error;
  }
}

function loadProviderContract(): {
  AppProviders: ComponentType<AppProvidersProps>;
  useAppTheme: UseAppTheme;
  useAppRuntime: UseAppRuntime;
  useAccountScope: UseAccountScope;
} {
  const providers = loadRequiredModule<ProvidersModule>(
    "../../src/core/providers/app-providers",
    "src/core/providers/app-providers.tsx",
  );
  const theme = loadRequiredModule<ThemeModule>(
    "../../src/core/theme/theme-provider",
    "src/core/theme/theme-provider.tsx",
  );

  if (typeof providers.AppProviders !== "function") {
    throw new Error(
      "M3-I3 implementation incomplete: app-providers.tsx must export AppProviders.",
    );
  }
  if (typeof providers.useAppRuntime !== "function") {
    throw new Error(
      "M5-RUNTIME-1 implementation incomplete: app-providers.tsx must export useAppRuntime().",
    );
  }
  if (typeof providers.useAccountScope !== "function") {
    throw new Error(
      "M6-04 implementation incomplete: app-providers.tsx must export useAccountScope().",
    );
  }
  if (typeof theme.useAppTheme !== "function") {
    throw new Error(
      "M3-I3 implementation incomplete: theme-provider.tsx must export useAppTheme().",
    );
  }

  return {
    AppProviders: providers.AppProviders as ComponentType<AppProvidersProps>,
    useAppTheme: theme.useAppTheme as UseAppTheme,
    useAppRuntime: providers.useAppRuntime as UseAppRuntime,
    useAccountScope: providers.useAccountScope as UseAccountScope,
  };
}

function createDeterministicDatabaseFactory(
  label: string,
): DatabaseProviderFactory {
  return jest.fn(async (): Promise<DatabaseResource> => ({
    close: async () => undefined,
    repository: {
      ensureFixtureConversation: async () => undefined,
      label,
    },
  }));
}

function fakeSessionController(
  initial: AuthState = { status: "loading", profile: null, message: null },
): AuthController & {
  publish: (next: AuthState) => void;
  bumpGeneration: () => void;
} {
  let state = initial;
  let generation = 1;
  const listeners = new Set<(value: AuthState) => void>();
  const publish = (next: AuthState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  return {
    getState: () => state,
    getGeneration: () => generation,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: jest.fn(),
    restore: jest.fn(async () => undefined),
    signIn: jest.fn(async () => undefined),
    logout: jest.fn(async () => undefined),
    retryProfile: jest.fn(async () => undefined),
    publish,
    bumpGeneration: () => {
      generation += 1;
    },
  };
}

function fakeAccountScope(): AccountScopeController & {
  setPrincipal: jest.Mock;
  publish: (next: AccountScopeRenderedState) => void;
} {
  let state: AccountScopeRenderedState = null;
  const listeners = new Set<() => void>();
  const publish = (next: AccountScopeRenderedState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getState: () => state,
    setPrincipal: jest.fn(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish,
  };
}

const mockedUseColorScheme = jest.mocked(useColorScheme);
const originalAppMode = process.env.EXPO_PUBLIC_APP_MODE;
const originalApiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

beforeEach(() => {
  process.env.EXPO_PUBLIC_APP_MODE = "local-fixture";
  delete process.env.EXPO_PUBLIC_API_ORIGIN;
});

afterEach(() => {
  if (originalAppMode === undefined) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = originalAppMode;
  if (originalApiOrigin === undefined)
    delete process.env.EXPO_PUBLIC_API_ORIGIN;
  else process.env.EXPO_PUBLIC_API_ORIGIN = originalApiOrigin;
  mockedUseColorScheme.mockReset();
});

describe("M3-I3 active provider and system theme contract", () => {
  test.each(EXPECTED_THEMES)(
    "provides the semantic $colorScheme theme selected by useColorScheme",
    async ({ colorScheme, primary, onPrimary }) => {
      mockedUseColorScheme.mockReturnValue(colorScheme);
      const { AppProviders, useAppTheme } = loadProviderContract();
      const databaseFactory = createDeterministicDatabaseFactory(
        `theme-${colorScheme}`,
      );
      const clockFactory = jest.fn((): ClockPort => ({ nowMs: () => 1 }));
      const messageIdentityFactory = jest.fn((): MessageIdentityPort => ({
        next: () => ({ clientMsgId: "theme-client", localId: "theme-local" }),
      }));

      function ThemeProbe(): React.JSX.Element {
        const theme = useAppTheme();
        return (
          <Text>
            {theme.colorScheme}:{String(theme.colors.primary)}:
            {String(theme.colors.onPrimary)}
          </Text>
        );
      }

      const screen = await render(
        <AppProviders
          clockFactory={clockFactory}
          databaseFactory={databaseFactory}
          messageIdentityFactory={messageIdentityFactory}
        >
          <ThemeProbe />
        </AppProviders>,
      );

      expect(
        await screen.findByText(`${colorScheme}:${primary}:${onPrimary}`),
      ).toBeTruthy();
    },
  );
});

describe("M5-RUNTIME-1 AppProviders runtime dependency contract", () => {
  test("publishes the exact injected repository, clock, and identity once after one successful database attempt", async () => {
    const repository: DatabaseRepository = {
      ensureFixtureConversation: async () => undefined,
      label: "injected-repository",
    };
    const close = jest.fn(async () => undefined);
    const databaseFactory = jest.fn(async (): Promise<DatabaseResource> => ({
      close,
      repository,
    }));
    const clock: ClockPort = { nowMs: () => 3456 };
    const messageIdentity: MessageIdentityPort = {
      next: () => ({
        clientMsgId: "client-message-1",
        localId: "local-message-1",
      }),
    };
    const clockFactory = jest.fn(() => clock);
    const messageIdentityFactory = jest.fn(() => messageIdentity);
    const { AppProviders, useAppRuntime } = loadProviderContract();

    function RuntimeProbe(): React.JSX.Element {
      const runtime = useAppRuntime();
      return (
        <Text>
          {runtime.repository.label}:{runtime.clock.nowMs()}:
          {runtime.messageIdentity.next().localId}
        </Text>
      );
    }

    const screen = await render(
      <AppProviders
        clockFactory={clockFactory}
        databaseFactory={databaseFactory}
        messageIdentityFactory={messageIdentityFactory}
      >
        <RuntimeProbe />
      </AppProviders>,
    );

    expect(
      await screen.findByText("injected-repository:3456:local-message-1"),
    ).toBeTruthy();
    expect(databaseFactory).toHaveBeenCalledTimes(1);
    expect(clockFactory).toHaveBeenCalledTimes(1);
    expect(messageIdentityFactory).toHaveBeenCalledTimes(1);

    await screen.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("uses the named production database, clock, and identity factories as defaults", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/core/providers/app-providers.tsx`,
      "utf8",
    );

    expect(source).toMatch(
      /import\s*\{[^}]*productionDatabaseFactory[^}]*\}\s*from\s*["'][^"']*database-provider["']/,
    );
    expect(source).toMatch(
      /import\s*\{[^}]*createSystemClock[^}]*\}\s*from\s*["'][^"']*chat-send["']/,
    );
    expect(source).toMatch(
      /import\s*\{[^}]*createMonotonicMessageIdentity[^}]*\}\s*from\s*["'][^"']*chat-send["']/,
    );
    expect(source).toMatch(/databaseFactory\s*=\s*productionDatabaseFactory/);
    expect(source).toMatch(/clockFactory\s*=\s*createSystemClock/);
    expect(source).toMatch(
      /messageIdentityFactory\s*=\s*createMonotonicMessageIdentity/,
    );
  });

  test("mounts the native keyboard controller above application consumers", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/core/providers/app-providers.tsx`,
      "utf8",
    );

    expect(source).toMatch(
      /import\s*\{[^}]*KeyboardProvider[^}]*\}\s*from\s*["']react-native-keyboard-controller["']/,
    );

    const keyboardProviderStart = source.indexOf("<KeyboardProvider>");
    const themeProviderStart = source.indexOf("<AppThemeProvider>");
    const keyboardProviderEnd = source.indexOf("</KeyboardProvider>");

    expect(keyboardProviderStart).toBeGreaterThan(-1);
    expect(keyboardProviderStart).toBeLessThan(themeProviderStart);
    expect(keyboardProviderEnd).toBeGreaterThan(themeProviderStart);
  });

  test("throws outside AppProviders instead of manufacturing a runtime fallback", async () => {
    const { useAppRuntime } = loadProviderContract();

    function OutsideProviderProbe(): React.JSX.Element {
      useAppRuntime();
      return <Text>unreachable</Text>;
    }

    await expect(render(<OutsideProviderProbe />)).rejects.toThrow(
      /useAppRuntime must be used inside AppProviders/i,
    );
  });
});

describe("M6-04 connected-auth mode composition", () => {
  const principalProfile = {
    id: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
    provider: "kakao",
    nickname: "name",
    avatarUrl: null,
    createdAt: "2020-01-01T00:00:00Z",
  };

  beforeEach(() => {
    process.env.EXPO_PUBLIC_APP_MODE = "connected-auth";
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example";
  });

  test("wires the account scope to the validated session principal and drops it on sign-out", async () => {
    const controller = fakeSessionController();
    const scope = fakeAccountScope();
    const { AppProviders, useAccountScope } = loadProviderContract();

    function ScopeProbe(): React.JSX.Element {
      const account = useAccountScope();
      return <Text testID="scope">{account.state?.status ?? "null"}</Text>;
    }

    const screen = await render(
      <AppProviders
        createAccountScope={() => scope}
        createSessionController={() => controller}
      >
        <ScopeProbe />
      </AppProviders>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(scope.setPrincipal).toHaveBeenLastCalledWith(null);

    await act(async () => {
      controller.publish({
        status: "signed-in",
        profile: principalProfile,
        message: null,
      });
    });
    expect(scope.setPrincipal).toHaveBeenLastCalledWith({
      origin: "https://api.example",
      userId: principalProfile.id,
      epoch: controller.getGeneration(),
    });

    await act(async () => {
      scope.publish({ status: "ready", database: {} });
    });
    expect(screen.getByTestId("scope").props.children).toBe("ready");

    await act(async () => {
      controller.publish({
        status: "signed-out",
        profile: null,
        message: null,
      });
    });
    expect(scope.setPrincipal).toHaveBeenLastCalledWith(null);
  });

  test("M12 binds the notifications store singleton to the session principal and clears it on sign-out", async () => {
    const controller = fakeSessionController();
    const scope = fakeAccountScope();
    const { AppProviders } = loadProviderContract();
    const { notificationsStore } = jest.requireActual<
      typeof import("../../src/features/notifications/model/notifications-store")
    >("../../src/features/notifications/model/notifications-store");
    const setPrincipal = jest.spyOn(notificationsStore, "setPrincipal");

    try {
      await render(
        <AppProviders
          createAccountScope={() => scope}
          createSessionController={() => controller}
        >
          <Text>child</Text>
        </AppProviders>,
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(setPrincipal).toHaveBeenLastCalledWith(null, null);

      await act(async () => {
        controller.publish({
          status: "signed-in",
          profile: principalProfile,
          message: null,
        });
      });
      expect(setPrincipal).toHaveBeenLastCalledWith(
        expect.objectContaining({
          origin: "https://api.example",
          userId: principalProfile.id,
          epoch: controller.getGeneration(),
        }),
        expect.any(Function),
      );

      await act(async () => {
        controller.publish({
          status: "signed-out",
          profile: null,
          message: null,
        });
      });
      expect(setPrincipal).toHaveBeenLastCalledWith(null, null);
    } finally {
      setPrincipal.mockRestore();
    }
  });

  test("A2: after session.logout() publishes signed-out, the account scope and the notifications store both unbind from the lost principal", async () => {
    const controller = fakeSessionController({
      status: "signed-in",
      profile: principalProfile,
      message: null,
    });
    const scope = fakeAccountScope();
    const { AppProviders } = loadProviderContract();
    const { notificationsStore } = jest.requireActual<
      typeof import("../../src/features/notifications/model/notifications-store")
    >("../../src/features/notifications/model/notifications-store");
    const setPrincipal = jest.spyOn(notificationsStore, "setPrincipal");

    try {
      await render(
        <AppProviders
          createAccountScope={() => scope}
          createSessionController={() => controller}
        >
          <Text>child</Text>
        </AppProviders>,
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(scope.setPrincipal).toHaveBeenLastCalledWith({
        origin: "https://api.example",
        userId: principalProfile.id,
        epoch: controller.getGeneration(),
      });
      expect(setPrincipal).toHaveBeenLastCalledWith(
        expect.objectContaining({ userId: principalProfile.id }),
        expect.any(Function),
      );

      // The real auth-controller.logout() synchronously publishes exactly
      // this signed-out state before any of its own async storage-clearing
      // work runs, so this is what every downstream consumer of
      // session.state/session.principal reacts to once session.logout()
      // (account-lifecycle.ts's deleteAccount success path, or the account
      // screen's own logout button) resolves the controller's generation
      // forward.
      await act(async () => {
        controller.publish({
          status: "signed-out",
          profile: null,
          message: null,
        });
      });
      expect(scope.setPrincipal).toHaveBeenLastCalledWith(null);
      expect(setPrincipal).toHaveBeenLastCalledWith(null, null);
    } finally {
      setPrincipal.mockRestore();
    }
  });

  test("supports an explicit account-scope retry after an error, with no fixture fallback", async () => {
    const controller = fakeSessionController({
      status: "signed-in",
      profile: principalProfile,
      message: null,
    });
    const scope = fakeAccountScope();
    const { AppProviders, useAccountScope } = loadProviderContract();
    let retry: (() => void) | undefined;

    function ScopeProbe(): React.JSX.Element {
      const account = useAccountScope();
      retry = account.retry;
      return <Text>{account.state?.status ?? "null"}</Text>;
    }

    await render(
      <AppProviders
        createAccountScope={() => scope}
        createSessionController={() => controller}
      >
        <ScopeProbe />
      </AppProviders>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    scope.setPrincipal.mockClear();

    await act(async () => {
      retry?.();
    });
    expect(scope.setPrincipal).toHaveBeenCalledWith({
      origin: "https://api.example",
      userId: principalProfile.id,
      epoch: controller.getGeneration(),
    });
  });

  test("never mounts the fixture database/runtime provider in connected-auth mode", async () => {
    const controller = fakeSessionController();
    const scope = fakeAccountScope();
    const databaseFactory =
      createDeterministicDatabaseFactory("should-not-run");
    const { AppProviders } = loadProviderContract();
    const clockFactory = jest.fn(() => ({ nowMs: () => 0 }));
    const messageIdentityFactory = jest.fn(() => ({
      next: () => ({ clientMsgId: "unused", localId: "unused" }),
    }));

    await render(
      <AppProviders
        createAccountScope={() => scope}
        createSessionController={() => controller}
        databaseFactory={databaseFactory}
        clockFactory={clockFactory}
        messageIdentityFactory={messageIdentityFactory}
      >
        <Text>connected</Text>
      </AppProviders>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(databaseFactory).not.toHaveBeenCalled();
    expect(clockFactory).not.toHaveBeenCalled();
    expect(messageIdentityFactory).not.toHaveBeenCalled();
  });

  test.each(["user", "epoch", "origin", "logout"])(
    "never publishes the previous database during a %s transition, including the render before effects",
    async (change) => {
      const controller = fakeSessionController({
        status: "signed-in",
        profile: principalProfile,
        message: null,
      });
      const scope = fakeAccountScope();
      scope.setPrincipal.mockImplementation((principal) => {
        scope.publish(principal ? { status: "opening" } : null);
      });
      const { AppProviders, useAccountScope } = loadProviderContract();
      const seen: AccountScopeRenderedState[] = [];
      const createSessionController = () => controller;
      function Probe() {
        const { state } = useAccountScope();
        seen.push(state);
        return <Text>{state?.status ?? "null"}</Text>;
      }
      const tree = (
        <AppProviders
          createSessionController={createSessionController}
          createAccountScope={() => scope}
        >
          <Probe />
        </AppProviders>
      );
      const screen = await render(tree);
      await act(async () => {
        scope.publish({ status: "ready", database: {} });
      });
      expect(seen.at(-1)?.status).toBe("ready");
      seen.length = 0;
      if (change === "origin") {
        process.env.EXPO_PUBLIC_API_ORIGIN = "https://another.example";
        await screen.rerender(React.cloneElement(tree));
      } else {
        await act(async () => {
          controller.bumpGeneration();
          controller.publish(
            change === "logout"
              ? { status: "signed-out", profile: null, message: null }
              : {
                  status: "signed-in",
                  message: null,
                  profile:
                    change === "user"
                      ? {
                          ...principalProfile,
                          id: "11111111-1111-4111-8111-111111111111",
                        }
                      : principalProfile,
                },
          );
        });
      }
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.some((state) => state?.status === "ready")).toBe(false);
    },
  );

  test("does not provide AppRuntimeContext (fixture runtime) in connected-auth mode", async () => {
    const controller = fakeSessionController();
    const scope = fakeAccountScope();
    const { AppProviders, useAppRuntime } = loadProviderContract();

    function RuntimeProbe(): React.JSX.Element {
      useAppRuntime();
      return <Text>unreachable</Text>;
    }

    await expect(
      render(
        <AppProviders
          createAccountScope={() => scope}
          createSessionController={() => controller}
        >
          <RuntimeProbe />
        </AppProviders>,
      ),
    ).rejects.toThrow(/useAppRuntime must be used inside AppProviders/i);
  });

  test("closes the account scope on unmount", async () => {
    const controller = fakeSessionController();
    const scope = fakeAccountScope();
    const { AppProviders } = loadProviderContract();

    const screen = await render(
      <AppProviders
        createAccountScope={() => scope}
        createSessionController={() => controller}
      >
        <Text>connected</Text>
      </AppProviders>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    scope.setPrincipal.mockClear();
    await act(async () => {
      screen.unmount();
    });
    expect(scope.setPrincipal).toHaveBeenCalledWith(null);
  });
});
