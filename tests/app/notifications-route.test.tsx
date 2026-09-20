import { render } from "@testing-library/react-native";
import React from "react";

const mockNotificationsInboxScreen = jest.fn(() => null);
const mockGroupRouteGuard = jest.fn(
  ({ children }: { children: React.ReactNode }) => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID="group-route-guard">{children}</View>;
  },
);

jest.mock("@/features/notifications/ui/notifications-inbox-screen", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    NotificationsInboxScreen: () => {
      mockNotificationsInboxScreen();
      return <Text testID="notifications-inbox-screen">notifications</Text>;
    },
  };
});
jest.mock("@/features/groups/ui/group-route-guard", () => ({
  GroupRouteGuard: (props: { children: React.ReactNode }) =>
    mockGroupRouteGuard(props),
}));

describe("notifications route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders the actual notifications route with NotificationsInboxScreen inside GroupRouteGuard", async () => {
    const NotificationsRoute = jest.requireActual<{
      default: () => React.JSX.Element;
    }>("../../src/app/notifications").default;
    const screen = await render(<NotificationsRoute />);

    expect(mockGroupRouteGuard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("group-route-guard")).toBeTruthy();
    expect(screen.getByTestId("notifications-inbox-screen")).toBeTruthy();
    expect(mockNotificationsInboxScreen).toHaveBeenCalledTimes(1);
  });
});
