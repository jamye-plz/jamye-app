import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

const mockRedirect = jest.fn(({ href }: { href: string }) => (
  <Text testID="redirect">{href}</Text>
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

const loadIndexRoute = () =>
  jest.requireActual<{
    default: () => React.JSX.Element;
  }>("../../src/app/index").default;

describe("index route (E7a/C13: a pure redirector, AUTH-AC1/AC2)", () => {
  beforeEach(() => {
    mockPrincipal = null;
    mockPendingInvitePeek.mockReturnValue(null);
    jest.clearAllMocks();
  });

  test("redirects to the (auth)/sign-in route while there is no validated principal (AUTH-AC1)", async () => {
    const IndexRoute = loadIndexRoute();
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
    const IndexRoute = loadIndexRoute();
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
    const IndexRoute = loadIndexRoute();
    const screen = await render(<IndexRoute />);
    expect(screen.getByTestId("redirect").props.children).toBe("/groups/join");
  });

  test("never hides the splash screen itself (E12: SessionProvider owns that)", async () => {
    const IndexRoute = loadIndexRoute();
    await render(<IndexRoute />);
    expect(mockHideAsync).not.toHaveBeenCalled();
  });
});
