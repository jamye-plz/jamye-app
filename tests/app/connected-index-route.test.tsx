import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

const mockRedirect = jest.fn(({ href }: { href: string }) => (
  <Text testID="redirect">{href}</Text>
));
const mockFixtureChat = jest.fn(() => (
  <Text testID="fixture-chat">fixture</Text>
));
const mockHideAsync = jest.fn(async () => undefined);
const mockPreventAutoHideAsync = jest.fn(async () => undefined);
const mockPendingInvitePeek = jest.fn<string | null, []>(() => null);
let mockPrincipal: Readonly<{
  origin: string;
  userId: string;
  epoch: number;
}> | null = null;

jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock("@/features/chat/ui/chat-screen", () => ({
  ChatScreen: () => mockFixtureChat(),
}));
jest.mock("expo-splash-screen", () => ({
  hideAsync: () => mockHideAsync(),
  preventAutoHideAsync: () => mockPreventAutoHideAsync(),
}));
jest.mock("@/features/groups/model/pending-invite-store", () => ({
  pendingInviteStore: { peek: () => mockPendingInvitePeek() },
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

describe("mode-aware index route (E7a/C13: a pure redirector, AUTH-AC1/AC2)", () => {
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
      mockPendingInvitePeek.mockReturnValue(null);
      jest.clearAllMocks();
    });

    test("redirects to the (auth)/sign-in route while there is no validated principal (AUTH-AC1)", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      const screen = await render(<IndexRoute />);
      expect(screen.getByTestId("redirect").props.children).toBe("/sign-in");
      expect(mockRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ href: "/sign-in" }),
      );
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
    });

    test("resumes a validated principal to the pending invite's join screen instead (A3/E6)", async () => {
      mockPrincipal = {
        origin: "https://api.example",
        userId: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
        epoch: 1,
      };
      mockPendingInvitePeek.mockReturnValue("an-invite-code");
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      const screen = await render(<IndexRoute />);
      expect(screen.getByTestId("redirect").props.children).toBe(
        "/groups/join",
      );
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

    test("redirects to /local-fixture, never rendering AuthScreen inline (AUTH-AC2)", async () => {
      const IndexRoute = jest.requireActual<{
        default: () => React.JSX.Element;
      }>("../../src/app/index").default;
      const screen = await render(<IndexRoute />);
      expect(screen.getByTestId("redirect").props.children).toBe(
        "/local-fixture",
      );
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

// M17 VERIFY (C13): splitting the fixture chat out of `/` into its own route
// must not make fixture data reachable in connected-auth mode, where `/` used
// to render it only for `local-fixture`.
describe("mode-gated /local-fixture route (C13: fixture data stays local-fixture-only)", () => {
  const previousMode = process.env.EXPO_PUBLIC_APP_MODE;
  const previousOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
  const loadLocalFixtureRoute = () =>
    jest.requireActual<{
      default: () => React.JSX.Element;
    }>("../../src/app/local-fixture").default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (previousMode === undefined) delete process.env.EXPO_PUBLIC_APP_MODE;
    else process.env.EXPO_PUBLIC_APP_MODE = previousMode;
    if (previousOrigin === undefined) delete process.env.EXPO_PUBLIC_API_ORIGIN;
    else process.env.EXPO_PUBLIC_API_ORIGIN = previousOrigin;
  });

  test("redirects to / in connected-auth mode instead of rendering the fixture chat", async () => {
    process.env.EXPO_PUBLIC_APP_MODE = "connected-auth";
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example";
    const LocalFixtureRoute = loadLocalFixtureRoute();
    const screen = await render(<LocalFixtureRoute />);
    expect(screen.getByTestId("redirect").props.children).toBe("/");
    expect(mockFixtureChat).not.toHaveBeenCalled();
  });

  test("renders the fixture chat in local-fixture mode", async () => {
    process.env.EXPO_PUBLIC_APP_MODE = "local-fixture";
    delete process.env.EXPO_PUBLIC_API_ORIGIN;
    const LocalFixtureRoute = loadLocalFixtureRoute();
    const screen = await render(<LocalFixtureRoute />);
    expect(screen.getByTestId("fixture-chat")).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
