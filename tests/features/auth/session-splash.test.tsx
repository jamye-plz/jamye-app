import { act, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import type { AuthController, AuthState } from "@/core/auth/auth-controller";
import { SessionProvider, useSession } from "@/core/providers/session-provider";
import * as SplashScreen from "expo-splash-screen";

// `jest.fn()` is created *inside* the factory (not referenced from an outer
// `const`): a `jest.mock` factory runs the moment `session-provider.tsx` is
// first required, which -- via the plain `import` above -- happens before
// any outer `const mockHideAsync = jest.fn()` in this file would have run,
// so an outer reference would read `undefined` here. Reading the mocked
// module's own exports afterward avoids that ordering entirely.
jest.mock("expo-splash-screen", () => ({
  hideAsync: jest.fn(async () => undefined),
  preventAutoHideAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: "cancel" })),
}));
const mockHideAsync = SplashScreen.hideAsync as jest.Mock;
const mockPreventAutoHideAsync = SplashScreen.preventAutoHideAsync as jest.Mock;

function fakeController(
  initial: AuthState = { status: "loading", profile: null, message: null },
): AuthController & { publish: (next: AuthState) => void } {
  let state = initial;
  const listeners = new Set<(value: AuthState) => void>();
  const publish = (next: AuthState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  return {
    getState: () => state,
    getGeneration: () => 1,
    subscribe: (listener: (value: AuthState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: jest.fn(),
    refresh: jest.fn(async () => null),
    restore: jest.fn(async () => undefined),
    signIn: jest.fn(async () => undefined),
    logout: jest.fn(async () => undefined),
    retryProfile: jest.fn(async () => undefined),
    authorizedRequest: jest.fn(async (execute) =>
      execute("fake-access-token", new AbortController().signal),
    ),
    applyProfile: jest.fn(),
    publish,
  };
}

function Probe() {
  const session = useSession();
  return <Text testID="probe">{session.state.status}</Text>;
}

describe("session-provider splash coordination (L3/E12)", () => {
  // `preventAutoHideAsync` fires exactly once, at module import (before any
  // test/beforeEach runs) -- clearing it here would erase the only call it
  // will ever make, so only `hideAsync` (called per test) is reset.
  beforeEach(() => {
    mockHideAsync.mockClear();
  });

  test("prevents auto-hide as soon as the module loads", () => {
    expect(mockPreventAutoHideAsync).toHaveBeenCalled();
  });

  test("hides the splash once restore settles into signed-out, and not again on a later transient loading state", async () => {
    const controller = fakeController({
      status: "loading",
      profile: null,
      message: null,
    });
    await render(
      <SessionProvider
        createController={() => controller}
        origin="https://api.example"
      >
        <Probe />
      </SessionProvider>,
    );
    expect(mockHideAsync).not.toHaveBeenCalled();
    // `act`'s callback must be awaited even when it looks synchronous --
    // `useSyncExternalStore`'s notify-driven update otherwise has not
    // flushed yet by the next line (proven by a probe-text check while
    // isolating this).
    await act(async () => {
      controller.publish({
        status: "signed-out",
        profile: null,
        message: null,
      });
    });
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      controller.publish({ status: "loading", profile: null, message: null });
      controller.publish({
        status: "signed-out",
        profile: null,
        message: null,
      });
    });
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  test("hides the splash after the 3s safety timeout even if restore never settles", async () => {
    jest.useFakeTimers();
    const controller = fakeController({
      status: "loading",
      profile: null,
      message: null,
    });
    await render(
      <SessionProvider
        createController={() => controller}
        origin="https://api.example"
      >
        <Probe />
      </SessionProvider>,
    );
    expect(mockHideAsync).not.toHaveBeenCalled();
    // The timeout callback only calls `SplashScreen.hideAsync()` (no React
    // state change), so advancing fake timers needs no `act` flush here.
    jest.advanceTimersByTime(3000);
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
