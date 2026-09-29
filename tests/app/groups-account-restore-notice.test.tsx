import { render } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { pendingAccountRestoreStore } from "@/features/auth/model/pending-account-restore-store";
import { ACCOUNT_RESTORED_MESSAGE } from "@/features/auth/ui/account-restore-notice";

import GroupsIndexRoute from "../../src/app/(tabs)/groups/index";
import JoinGroupRoute from "../../src/app/groups/join";

// G2/E13, AC2-AC4: `SystemFeedbackHost`/`AccountRestoreNotice` are real here
// (that is what this file verifies); `GroupListScreen`/`GroupFormScreen`
// (feature-owned, unmodified) are stubbed so this stays a thin route-level
// test. `@expo/ui/swift-ui`'s `Alert` needs an inline mock per-test (jest
// always resolves iOS) -- same shape as tests/features/groups/ui's own.
jest.mock("@expo/ui/swift-ui", () => {
  const {
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  function Alert(
    props: Readonly<{
      children?: ReactNode;
      isPresented?: boolean;
      testID?: string;
      title?: string;
    }>,
  ) {
    if (!props.isPresented) return null;
    return (
      <View testID={props.testID ?? "alert"}>
        {props.title ? (
          <RNText accessibilityRole="header">{props.title}</RNText>
        ) : null}
        {props.children}
      </View>
    );
  }
  const slot = () =>
    function MockSlot({ children }: Readonly<{ children?: ReactNode }>) {
      return <View>{children}</View>;
    };
  Alert.Trigger = slot();
  Alert.Actions = slot();
  Alert.Message = slot();
  function Button(
    props: Readonly<{ label?: string; onPress?: () => void; role?: string }>,
  ) {
    return (
      <Pressable
        accessibilityHint={props.role}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        onPress={props.onPress}
      />
    );
  }
  function Spacer() {
    return <View testID="spacer" />;
  }
  function MockText({ children }: Readonly<{ children?: ReactNode }>) {
    return <RNText>{children}</RNText>;
  }
  return { Alert, Button, Spacer, Text: MockText };
});
jest.mock("@/features/groups/ui/group-route-guard", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    GroupRouteGuard: ({ children }: Readonly<{ children: ReactNode }>) => (
      <View testID="group-route-guard">{children}</View>
    ),
  };
});
jest.mock("@/features/groups/ui/group-list-screen", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { GroupListScreen: () => <Text>group-list-stub</Text> };
});
jest.mock("@/features/groups/ui/group-form-screen", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    GroupFormScreen: ({ mode }: Readonly<{ mode: string }>) => (
      <Text>{`group-form-stub-${mode}`}</Text>
    ),
  };
});
jest.mock("expo-router", () => {
  const mockReact = jest.requireActual<typeof import("react")>("react");
  return {
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => (() => void) | void) =>
      mockReact.useEffect(callback, [callback]),
  };
});

describe("groups/join account-restore notice (G2/E13, AC2-AC4)", () => {
  afterEach(() => pendingAccountRestoreStore.clear());

  test("shows the restore notice once on the group list route when a signal is pending", async () => {
    pendingAccountRestoreStore.set();
    const screen = await render(<GroupsIndexRoute />);
    expect(await screen.findByText(ACCOUNT_RESTORED_MESSAGE)).toBeTruthy();
    expect(pendingAccountRestoreStore.peek()).toBe(false);
  });

  test("shows no restore notice on the group list route when nothing is pending", async () => {
    const screen = await render(<GroupsIndexRoute />);
    expect(screen.queryByText(ACCOUNT_RESTORED_MESSAGE)).toBeNull();
  });

  test("shows the restore notice once on the invite-join route when a signal is pending", async () => {
    pendingAccountRestoreStore.set();
    const screen = await render(<JoinGroupRoute />);
    expect(await screen.findByText(ACCOUNT_RESTORED_MESSAGE)).toBeTruthy();
    expect(pendingAccountRestoreStore.peek()).toBe(false);
  });

  test("a later mount never repeats a signal already consumed by an earlier screen", async () => {
    pendingAccountRestoreStore.set();
    const first = await render(<GroupsIndexRoute />);
    expect(await first.findByText(ACCOUNT_RESTORED_MESSAGE)).toBeTruthy();
    first.unmount();
    const second = await render(<JoinGroupRoute />);
    expect(second.queryByText(ACCOUNT_RESTORED_MESSAGE)).toBeNull();
  });
});
