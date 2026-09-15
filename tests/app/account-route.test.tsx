import { render } from "@testing-library/react-native";
import React from "react";

const mockAccountScreen = jest.fn(() => null);
const mockGroupRouteGuard = jest.fn(
  ({ children }: { children: React.ReactNode }) => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID="group-route-guard">{children}</View>;
  },
);

jest.mock("@/features/home/ui/account-screen", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AccountScreen: () => {
      mockAccountScreen();
      return <Text testID="account-screen">account</Text>;
    },
  };
});
jest.mock("@/features/groups/ui/group-route-guard", () => ({
  GroupRouteGuard: (props: { children: React.ReactNode }) =>
    mockGroupRouteGuard(props),
}));

describe("account route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders the actual account route with AccountScreen inside GroupRouteGuard", async () => {
    const AccountRoute = jest.requireActual<{
      default: () => React.JSX.Element;
    }>("../../src/app/account").default;
    const screen = await render(<AccountRoute />);

    expect(mockGroupRouteGuard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("group-route-guard")).toBeTruthy();
    expect(screen.getByTestId("account-screen")).toBeTruthy();
    expect(mockAccountScreen).toHaveBeenCalledTimes(1);
  });
});
