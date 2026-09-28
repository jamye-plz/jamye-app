import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

const mockAuthScreen = jest.fn(() => <Text testID="auth-screen">auth</Text>);
const mockChatScreen = jest.fn(() => <Text testID="chat-screen">chat</Text>);
const mockRedirect = jest.fn(({ href }: { href: string }) => (
  <Text testID="redirect">{href}</Text>
));
const mockHideAsync = jest.fn(async () => undefined);
const mockPreventAutoHideAsync = jest.fn(async () => undefined);
let mockPrincipal: Readonly<{
  origin: string;
  userId: string;
  epoch: number;
}> | null = null;

jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock("expo-splash-screen", () => ({
  hideAsync: () => mockHideAsync(),
  preventAutoHideAsync: () => mockPreventAutoHideAsync(),
}));
jest.mock("@/features/auth/ui/auth-screen", () => ({
  AuthScreen: () => mockAuthScreen(),
}));
jest.mock("@/features/chat/ui/chat-screen", () => ({
  ChatScreen: () => mockChatScreen(),
}));
jest.mock("@/core/providers/session-provider", () => ({
  useSession: jest.fn(() => ({
    state: { status: "signed-out", profile: null, message: null },
    principal: mockPrincipal,
    login: jest.fn(),
    logout: jest.fn(),
    restore: jest.fn(),
    retryProfile: jest.fn(),
  })),
}));

describe("mode-aware index route", () => {
  const previousMode = process.env.EXPO_PUBLIC_APP_MODE;
  const previousOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

  afterAll(() => {
    if (previousMode === undefined) delete process.env.EXPO_PUBLIC_APP_MODE;
    else process.env.EXPO_PUBLIC_APP_MODE = previousMode;
    if (previousOrigin === undefined) delete process.env.EXPO_PUBLIC_API_ORIGIN;
    else process.env.EXPO_PUBLIC_API_ORIGIN = previousOrigin;
  });

  describe("connected-auth mode", () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_APP_MODE = "connected-auth";
      process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example";
      mockPrincipal = null;
      jest.clearAllMocks();
    });

    test("renders AuthScreen (no redirect) while there is no validated principal", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      const screen = await render(<IndexRoute />);
      expect(screen.getByTestId("auth-screen")).toBeTruthy();
      expect(screen.queryByTestId("redirect")).toBeNull();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockChatScreen).not.toHaveBeenCalled();
    });

    test("redirects a validated principal into the groups tab (ADR 0009)", async () => {
      mockPrincipal = {
        origin: "https://api.example",
        userId: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
        epoch: 1,
      };
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      const screen = await render(<IndexRoute />);
      expect(screen.getByTestId("redirect").props.children).toBe("/groups");
      expect(mockRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ href: "/groups" }),
      );
      expect(screen.queryByTestId("auth-screen")).toBeNull();
    });

    test("falls back to AuthScreen the instant the session reports no principal, never redirecting", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      mockPrincipal = null;
      const screen = await render(<IndexRoute />);
      expect(screen.queryByTestId("redirect")).toBeNull();
      expect(screen.getByTestId("auth-screen")).toBeTruthy();
    });

    test("never hides the splash screen itself (E12: SessionProvider owns that in connected-auth mode)", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      await render(<IndexRoute />);
      expect(mockHideAsync).not.toHaveBeenCalled();
    });
  });

  describe("local-fixture mode", () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_APP_MODE = "local-fixture";
      delete process.env.EXPO_PUBLIC_API_ORIGIN;
      jest.clearAllMocks();
    });

    test("renders the unchanged local fixture ChatScreen, never AuthScreen or a redirect", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      const screen = await render(<IndexRoute />);
      expect(screen.getByTestId("chat-screen")).toBeTruthy();
      expect(mockAuthScreen).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    test("hides the splash screen immediately (E12: fixture mode never mounts SessionProvider)", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      await render(<IndexRoute />);
      expect(mockHideAsync).toHaveBeenCalledTimes(1);
    });
  });
});
