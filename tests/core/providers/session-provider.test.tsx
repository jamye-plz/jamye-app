import { act, render, renderHook } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import type { AuthController, AuthState } from "@/core/auth/auth-controller";
import { SessionProvider, useSession } from "@/core/providers/session-provider";

const profile = {
  id: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
  provider: "kakao",
  nickname: "name",
  avatarUrl: null,
  createdAt: "2020-01-01T00:00:00Z",
};

function fakeController(
  initial: AuthState = { status: "loading", profile: null, message: null },
) {
  let state = initial;
  let generation = 1;
  const listeners = new Set<(value: AuthState) => void>();
  const publish = (next: AuthState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  const controller: AuthController & {
    publish: (next: AuthState) => void;
    bumpGeneration: () => void;
  } = {
    getState: () => state,
    getGeneration: () => generation,
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
    publish,
    bumpGeneration: () => {
      generation += 1;
    },
  };
  return controller;
}

function Probe(): React.JSX.Element {
  const session = useSession();
  return (
    <Text testID="probe">
      {JSON.stringify({
        status: session.state.status,
        principal: session.principal,
      })}
    </Text>
  );
}

describe("SessionProvider / useSession", () => {
  test("builds exactly one controller per mount and calls restore once", async () => {
    const controller = fakeController();
    const createController = jest.fn(() => controller);
    await render(
      <SessionProvider
        origin="https://api.example"
        createController={createController}
      >
        <Probe />
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(createController).toHaveBeenCalledTimes(1);
    expect(controller.restore).toHaveBeenCalledTimes(1);
  });

  test("disposes the controller on unmount so late work is fenced", async () => {
    const controller = fakeController();
    const createController = jest.fn(() => controller);
    const screen = await render(
      <SessionProvider
        origin="https://api.example"
        createController={createController}
      >
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      screen.unmount();
    });
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });

  test("publishes no principal until a signed-in state carries a valid U1 UUID", async () => {
    const controller = fakeController();
    const createController = jest.fn(() => controller);
    const screen = await render(
      <SessionProvider
        origin="https://api.example"
        createController={createController}
      >
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("probe").props.children).toContain(
      '"principal":null',
    );

    await act(async () => {
      controller.publish({ status: "signed-in", profile, message: null });
    });
    const parsed = JSON.parse(screen.getByTestId("probe").props.children);
    expect(parsed.principal).toEqual({
      origin: "https://api.example",
      userId: profile.id,
      epoch: controller.getGeneration(),
    });
  });

  test("never publishes a principal when U1's id is not a valid UUID", async () => {
    const controller = fakeController();
    const createController = jest.fn(() => controller);
    const screen = await render(
      <SessionProvider
        origin="https://api.example"
        createController={createController}
      >
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      controller.publish({
        status: "signed-in",
        profile: { ...profile, id: "not-a-uuid" },
        message: null,
      });
    });
    const parsed = JSON.parse(screen.getByTestId("probe").props.children);
    expect(parsed.status).toBe("signed-in");
    expect(parsed.principal).toBeNull();
  });

  test("delegates login/logout/retryProfile to the controller with the caller signal", async () => {
    const controller = fakeController();
    const createController = jest.fn(() => controller);
    const { result } = await renderHook(() => useSession(), {
      wrapper: ({ children }) => (
        <SessionProvider
          origin="https://api.example"
          createController={createController}
        >
          {children}
        </SessionProvider>
      ),
    });
    await act(async () => {
      await Promise.resolve();
    });
    const signal = new AbortController().signal;
    await act(async () => {
      await result.current.login(
        "kakao",
        "https://api.example/callback",
        "jamye://oauth/kakao",
        signal,
      );
      await result.current.retryProfile(signal);
      await result.current.logout(signal);
    });
    expect(controller.signIn).toHaveBeenCalledWith(
      "kakao",
      "https://api.example/callback",
      "jamye://oauth/kakao",
      signal,
    );
    expect(controller.retryProfile).toHaveBeenCalledWith(signal);
    expect(controller.logout).toHaveBeenCalledWith(signal);
  });

  test("does not carry the previous profile into a replacement origin/controller", async () => {
    const oldController = fakeController({
      status: "signed-in",
      profile,
      message: null,
    });
    const nextController = fakeController();
    const createController = (origin: string) =>
      origin === "https://old.example" ? oldController : nextController;
    const screen = await render(
      <SessionProvider
        origin="https://old.example"
        createController={createController}
      >
        <Probe />
      </SessionProvider>,
    );
    await screen.rerender(
      <SessionProvider
        origin="https://next.example"
        createController={createController}
      >
        <Probe />
      </SessionProvider>,
    );
    expect(JSON.parse(screen.getByTestId("probe").props.children)).toEqual({
      status: "loading",
      principal: null,
    });
    expect(oldController.dispose).toHaveBeenCalled();
  });
});
