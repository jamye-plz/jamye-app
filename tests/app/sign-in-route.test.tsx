import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

const mockAuthScreen = jest.fn(() => <Text testID="auth-screen">auth</Text>);
const mockRedirect = jest.fn(({ href }: { href: string }) => (
  <Text testID="redirect">{href}</Text>
));
const mockPendingInvitePeek = jest.fn<string | null, []>(() => null);
let mockPrincipal: Readonly<{
  origin: string;
  userId: string;
  epoch: number;
}> | null = null;

jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock("@/features/auth/ui/auth-screen", () => ({
  AuthScreen: () => mockAuthScreen(),
}));
jest.mock("@/features/groups/model/pending-invite-store", () => ({
  pendingInviteStore: { peek: () => mockPendingInvitePeek() },
}));
jest.mock("@/core/providers/session-provider", () => ({
  useSession: jest.fn(() => ({
    state: { status: "signed-out", profile: null, message: null },
    principal: mockPrincipal,
  })),
}));

/**
 * E7a/C13/AUTH-AC1: `(auth)/sign-in` mirrors `app/index.tsx`'s previous
 * `ConnectedIndexRoute` logic, since every signed-out protected route now
 * redirects here directly (not through `/`) -- this covers both "reached
 * this route while already signed in" (a stale deep link/guard race) and
 * "just finished signing in while this screen was showing".
 */
describe("(auth)/sign-in route", () => {
  beforeEach(() => {
    mockPrincipal = null;
    mockPendingInvitePeek.mockReturnValue(null);
    jest.clearAllMocks();
  });

  test("renders AuthScreen (no redirect) while there is no validated principal", async () => {
    const SignInRoute = jest.requireActual<{
      default: () => React.JSX.Element;
    }>("../../src/app/(auth)/sign-in").default;
    const screen = await render(<SignInRoute />);
    expect(screen.getByTestId("auth-screen")).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  test("redirects an already-validated principal to the groups tab instead of showing the login screen", async () => {
    mockPrincipal = {
      origin: "https://api.example",
      userId: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
      epoch: 1,
    };
    const SignInRoute = jest.requireActual<{
      default: () => React.JSX.Element;
    }>("../../src/app/(auth)/sign-in").default;
    const screen = await render(<SignInRoute />);
    expect(screen.getByTestId("redirect").props.children).toBe("/groups");
    expect(screen.queryByTestId("auth-screen")).toBeNull();
  });

  test("resumes a validated principal to the pending invite's join screen instead (A3/E6)", async () => {
    mockPrincipal = {
      origin: "https://api.example",
      userId: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
      epoch: 1,
    };
    mockPendingInvitePeek.mockReturnValue("an-invite-code");
    const SignInRoute = jest.requireActual<{
      default: () => React.JSX.Element;
    }>("../../src/app/(auth)/sign-in").default;
    const screen = await render(<SignInRoute />);
    expect(screen.getByTestId("redirect").props.children).toBe("/groups/join");
  });
});
