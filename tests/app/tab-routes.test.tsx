import { render } from "@testing-library/react-native";
import React from "react";
import { AppThemeProvider } from "@/core/theme/theme-provider";

let mockParams: Record<string, string | string[]> = {};
const mockStack = jest.fn(
  (_props: Readonly<{ screenOptions?: Record<string, unknown> }>) => null,
);
const mockTopicsScreen = jest.fn((_props: { groupId: string }) => null);
const mockGroupDetailScreen = jest.fn((_props: { groupId: string }) => null);
const mockTopicDetailScreen = jest.fn(
  (_props: { groupId: string; topicId: string }) => null,
);

jest.mock("expo-router", () => ({
  Stack: (props: Readonly<{ screenOptions?: Record<string, unknown> }>) => {
    mockStack(props);
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID="stack" />;
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/features/groups/ui/group-route-guard", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    GroupRouteGuard: ({ children }: { children: React.ReactNode }) => (
      <View testID="group-route-guard">{children}</View>
    ),
  };
});
jest.mock("@/features/chat/ui/chat-route-guard", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ChatRouteGuard: ({ children }: { children: React.ReactNode }) => (
      <View testID="chat-route-guard">{children}</View>
    ),
  };
});
jest.mock("@/features/groups/ui/group-list-screen", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    GroupListScreen: () => <Text testID="group-list">groups</Text>,
  };
});
// G2/E13: this file tests thin route structure, not the restore notice
// itself (see tests/app/groups-account-restore-notice.test.tsx for that) --
// stub both out so the group-list route test never pulls in a real
// SystemFeedbackHost (@expo/ui/swift-ui's Alert is unmocked here).
jest.mock("@/shared/ui/system-feedback", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SystemFeedbackHost: ({ children }: { children: React.ReactNode }) => (
      <View testID="system-feedback-host">{children}</View>
    ),
    useSystemFeedback: () => ({ showNotice: jest.fn() }),
  };
});
jest.mock("@/features/auth/ui/account-restore-notice", () => ({
  AccountRestoreNotice: () => null,
}));
jest.mock("@/features/topics/ui/topics-screen", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    TopicsScreen: (props: { groupId: string }) => {
      mockTopicsScreen(props);
      return <Text testID="topics-screen">{props.groupId}</Text>;
    },
  };
});
jest.mock("@/features/groups/ui/group-detail-screen", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    GroupDetailScreen: (props: { groupId: string }) => {
      mockGroupDetailScreen(props);
      return <Text testID="group-info-screen">{props.groupId}</Text>;
    },
  };
});
jest.mock("@/features/topics/ui/topic-detail-screen", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    TopicDetailScreen: (props: { groupId: string; topicId: string }) => {
      mockTopicDetailScreen(props);
      return <Text testID="topic-detail-screen">{props.topicId}</Text>;
    },
  };
});

function loadRoute(path: string): () => React.JSX.Element {
  return jest.requireActual<{ default: () => React.JSX.Element }>(path).default;
}

describe("M14 round 1 tab routes", () => {
  beforeEach(() => {
    mockParams = {};
    jest.clearAllMocks();
  });

  test("groups tab root renders the group list inside the group guard", async () => {
    const Route = loadRoute("../../src/app/(tabs)/groups/index");
    const screen = await render(<Route />);
    expect(screen.getByTestId("group-route-guard")).toBeTruthy();
    expect(screen.getByTestId("group-list")).toBeTruthy();
  });

  test("group home renders the topic list for the route group inside the chat guard", async () => {
    mockParams = { groupId: "11111111-1111-4111-8111-111111111111" };
    const Route = loadRoute("../../src/app/(tabs)/groups/[groupId]/index");
    const screen = await render(<Route />);
    expect(screen.getByTestId("chat-route-guard")).toBeTruthy();
    expect(mockTopicsScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "11111111-1111-4111-8111-111111111111",
      }),
    );
  });

  test("group home passes an empty id (never an array) for a malformed param", async () => {
    mockParams = { groupId: ["a", "b"] };
    const Route = loadRoute("../../src/app/(tabs)/groups/[groupId]/index");
    await render(<Route />);
    expect(mockTopicsScreen).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "" }),
    );
  });

  test("group info renders the management screen inside the group guard", async () => {
    mockParams = { groupId: "11111111-1111-4111-8111-111111111111" };
    const Route = loadRoute("../../src/app/(tabs)/groups/[groupId]/info");
    const screen = await render(<Route />);
    expect(screen.getByTestId("group-route-guard")).toBeTruthy();
    expect(mockGroupDetailScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "11111111-1111-4111-8111-111111111111",
      }),
    );
  });

  test("group info passes an empty id (never an array) for a malformed param", async () => {
    mockParams = { groupId: ["a", "b"] };
    const Route = loadRoute("../../src/app/(tabs)/groups/[groupId]/info");
    await render(<Route />);
    expect(mockGroupDetailScreen).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "" }),
    );
  });

  test("topic detail (D6) is a root-Stack route, above the chatroom, inside the chat guard", async () => {
    mockParams = {
      groupId: "11111111-1111-4111-8111-111111111111",
      topicId: "22222222-2222-4222-8222-222222222222",
    };
    const Route = loadRoute("../../src/app/groups/[groupId]/topics/[topicId]");
    const screen = await render(<Route />);
    expect(screen.getByTestId("chat-route-guard")).toBeTruthy();
    expect(mockTopicDetailScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "11111111-1111-4111-8111-111111111111",
        topicId: "22222222-2222-4222-8222-222222222222",
      }),
    );
  });

  test.each([
    "../../src/app/(tabs)/groups/_layout",
    "../../src/app/(tabs)/notifications/_layout",
    "../../src/app/(tabs)/account/_layout",
  ])(
    "%s renders a native Stack with the shared header options",
    async (path) => {
      const Layout = loadRoute(path);
      const screen = await render(
        <AppThemeProvider>
          <Layout />
        </AppThemeProvider>,
      );
      expect(screen.getByTestId("stack")).toBeTruthy();
      const options = mockStack.mock.calls.at(-1)?.[0].screenOptions as {
        headerShown: boolean;
        headerBackButtonDisplayMode: string;
        headerShadowVisible: boolean;
      };
      expect(options.headerShown).toBe(true);
      expect(options.headerBackButtonDisplayMode).toBe("minimal");
      expect(options.headerShadowVisible).toBe(false);
    },
  );
});
