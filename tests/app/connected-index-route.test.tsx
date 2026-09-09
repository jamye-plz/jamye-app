import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

const mockAuthScreen = jest.fn(() => <Text testID="auth-screen">auth</Text>);
const mockHomeScreen = jest.fn(() => <Text testID="home-screen">home</Text>);
const mockChatScreen = jest.fn(() => <Text testID="chat-screen">chat</Text>);
let mockPrincipal: Readonly<{
  origin: string;
  userId: string;
  epoch: number;
}> | null = null;

jest.mock("@/features/auth/ui/auth-screen", () => ({
  AuthScreen: () => mockAuthScreen(),
}));
jest.mock("@/features/home/ui/home-screen", () => ({
  HomeScreen: () => mockHomeScreen(),
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

    test("renders AuthScreen (not HomeScreen) while there is no validated principal", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      const screen = await render(<IndexRoute />);
      expect(screen.getByTestId("auth-screen")).toBeTruthy();
      expect(screen.queryByTestId("home-screen")).toBeNull();
      expect(mockChatScreen).not.toHaveBeenCalled();
    });

    test("renders HomeScreen once a validated session principal exists", async () => {
      mockPrincipal = {
        origin: "https://api.example",
        userId: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
        epoch: 1,
      };
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      const screen = await render(<IndexRoute />);
      expect(screen.getByTestId("home-screen")).toBeTruthy();
      expect(screen.queryByTestId("auth-screen")).toBeNull();
    });

    test("falls back to AuthScreen the instant the session reports no principal, never rendering a stale Home", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      mockPrincipal = null;
      const screen = await render(<IndexRoute />);
      expect(screen.queryByTestId("home-screen")).toBeNull();
      expect(screen.getByTestId("auth-screen")).toBeTruthy();
    });
  });

  describe("local-fixture mode", () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_APP_MODE = "local-fixture";
      delete process.env.EXPO_PUBLIC_API_ORIGIN;
      jest.clearAllMocks();
    });

    test("renders the unchanged local fixture ChatScreen, never AuthScreen/HomeScreen", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      const screen = await render(<IndexRoute />);
      expect(screen.getByTestId("chat-screen")).toBeTruthy();
      expect(mockAuthScreen).not.toHaveBeenCalled();
      expect(mockHomeScreen).not.toHaveBeenCalled();
    });
  });
});
