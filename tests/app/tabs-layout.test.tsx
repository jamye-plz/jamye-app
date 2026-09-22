import { render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { AppThemeProvider } from "@/core/theme/theme-provider";

type IconRecord = Readonly<{ md?: string; sf?: string }>;
const mockTabs = jest.fn((_props: { tintColor?: unknown }) => undefined);
const mockTrigger = jest.fn((_props: { name?: string }) => undefined);
const mockIcon = jest.fn((_props: IconRecord) => undefined);
let mockUnreadCount = 0;

jest.mock("expo-router/unstable-native-tabs", () => {
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function NativeTabs({
    children,
    tintColor,
  }: Readonly<{ children?: ReactNode; tintColor?: unknown }>) {
    mockTabs({ tintColor });
    return <View testID="native-tabs">{children}</View>;
  }
  function Trigger({
    children,
    name,
  }: Readonly<{ children?: ReactNode; name?: string }>) {
    mockTrigger({ name });
    return <View testID={`tab-${name}`}>{children}</View>;
  }
  function TriggerLabel({ children }: Readonly<{ children?: string }>) {
    return <Text>{children}</Text>;
  }
  function TriggerIcon(props: IconRecord) {
    mockIcon({ md: props.md, sf: props.sf });
    return null;
  }
  function TriggerBadge({
    children,
    hidden,
  }: Readonly<{ children?: string; hidden?: boolean }>) {
    return hidden ? null : <Text testID="tab-badge">{children}</Text>;
  }
  Trigger.Label = TriggerLabel;
  Trigger.Icon = TriggerIcon;
  Trigger.Badge = TriggerBadge;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});
jest.mock("@/features/notifications/ui/use-notifications-unread-count", () => ({
  useNotificationsUnreadCount: () => mockUnreadCount,
}));

async function renderLayout() {
  const TabsLayout = jest.requireActual<{
    default: () => React.JSX.Element;
  }>("../../src/app/(tabs)/_layout").default;
  return render(
    <AppThemeProvider>
      <TabsLayout />
    </AppThemeProvider>,
  );
}

describe("(tabs) layout — ADR 0009 tab bar drawn natively (ADR 0010)", () => {
  beforeEach(() => {
    mockUnreadCount = 0;
    jest.clearAllMocks();
  });

  test("declares the groups, notifications and account triggers with platform icons", async () => {
    const screen = await renderLayout();
    expect(mockTrigger.mock.calls.map((call) => call[0].name)).toEqual([
      "groups",
      "notifications",
      "account",
    ]);
    expect(mockIcon.mock.calls.map((call) => call[0])).toEqual([
      { md: "group", sf: "person.2" },
      { md: "notifications", sf: "bell" },
      { md: "account_circle", sf: "person.crop.circle" },
    ]);
    expect(screen.getByText("그룹")).toBeTruthy();
    expect(screen.getByText("알림")).toBeTruthy();
    expect(screen.getByText("계정")).toBeTruthy();
    expect(mockTabs).toHaveBeenCalledWith({ tintColor: "#9B3F68" });
    expect(screen.queryByTestId("tab-badge")).toBeNull();
  });

  test("shows the live unread count as the notifications tab badge", async () => {
    mockUnreadCount = 3;
    const screen = await renderLayout();
    const badge = screen.getByTestId("tab-badge");
    expect(badge.props.children).toBe("3");
    expect(screen.getByTestId("tab-notifications")).toContainElement(badge);
  });

  test("resolveNotificationsTabBadge hides zero and caps large counts", () => {
    const { resolveNotificationsTabBadge } = jest.requireActual<{
      resolveNotificationsTabBadge: (count: number) => string | undefined;
    }>("../../src/app/(tabs)/_layout");
    expect(resolveNotificationsTabBadge(0)).toBeUndefined();
    expect(resolveNotificationsTabBadge(-1)).toBeUndefined();
    expect(resolveNotificationsTabBadge(1)).toBe("1");
    expect(resolveNotificationsTabBadge(99)).toBe("99");
    expect(resolveNotificationsTabBadge(100)).toBe("99+");
  });

  test("resolveNativeTabsPlatformProps colors the Material bar from the Berry palette on Android only", () => {
    const { resolveNativeTabsPlatformProps } = jest.requireActual<{
      resolveNativeTabsPlatformProps: (
        os: string | undefined,
        colors: Record<string, string>,
      ) => Record<string, unknown>;
    }>("../../src/app/(tabs)/_layout");
    const colors = {
      accentContainer: "#FFD9E4",
      primary: "#9B3F68",
      surface: "#F7EBED",
      textMuted: "#514347",
    };
    expect(resolveNativeTabsPlatformProps("ios", colors)).toEqual({});
    expect(resolveNativeTabsPlatformProps("android", colors)).toEqual({
      backgroundColor: "#F7EBED",
      iconColor: { default: "#514347", selected: "#9B3F68" },
      indicatorColor: "#FFD9E4",
      labelStyle: {
        default: { color: "#514347" },
        selected: { color: "#9B3F68" },
      },
    });
  });
});
