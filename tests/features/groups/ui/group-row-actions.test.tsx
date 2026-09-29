import { fireEvent, render, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text as RNText } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { initialGroupsState } from "@/features/groups/model/groups-state";
import type { GroupsState } from "@/features/groups/model/groups-state";

import { group, member, otherId, userId } from "../groups-fixtures";

/**
 * SHIP UX MEDIUM (ship-ux-20260928-171401.md): group-row-actions.tsx's
 * ownership-transfer picker (178-224) -- including its `ComposeRnHost`-hosted
 * leading avatar -- had no dedicated test; `group-transfer-picker` never
 * appeared anywhere in `tests`. This renders `useGroupRowActions()`'s row
 * action and `overlays` through a small harness (not the full group-list/
 * group-detail screens, which already cover the picker's list/confirm flow
 * at the API level but never spy on `ComposeRnHost`).
 */
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => ({
    principal: { userId: "22222222-2222-4222-8222-222222222222" },
  }),
}));

// Default (iOS/no-op) file under jest's forced-iOS resolution; replaced with
// a spy so the assertions below can see it wrapping each row's leading
// avatar.
jest.mock("@/shared/ui/compose-rn-host", () => {
  const { View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ComposeRnHost: ({ children }: Readonly<{ children?: ReactNode }>) => (
      <MockView testID="compose-rn-host">{children}</MockView>
    ),
  };
});

// ConfirmAlert resolves to confirm-alert.ios.tsx (@expo/ui/swift-ui's Alert);
// there is no shared global mock for swift-ui (shared test rule: always an
// inline per-file mock). Mirrors groups-home.test.tsx's Alert/Button/Spacer/
// Text block, trimmed to what ConfirmAlert renders.
jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
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
        <Text accessibilityRole="header">{props.title}</Text>
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
    return <Text>{children}</Text>;
  }
  return { Alert, Button, Spacer, Text: MockText };
});

const mockOpenGroup = jest.fn();
const mockCloseGroup = jest.fn();
const mockTransferOwnership = jest.fn().mockResolvedValue(true);
const mockGetState = jest.fn();

// `useGroupsStore` is the only export `group-row-actions.tsx` pulls from this
// module; `state`/`getState` both read through the same mutable mock so
// `opened(id)` (`getState().detail.id === id`) is stable across renders.
jest.mock("@/features/groups/model/groups-provider", () => ({
  useGroupsStore: () => ({
    actions: {
      closeGroup: mockCloseGroup,
      openGroup: mockOpenGroup,
      transferOwnership: mockTransferOwnership,
    },
    getState: mockGetState,
    state: mockGetState(),
  }),
}));

// Loaded after the mock consts above (not a top-level import) so this
// module's own transitive require of "../model/groups-provider" runs once
// mockGetState etc. already exist -- mirrors tests/app/account-route.test.tsx
// and tests/app/tabs-layout.test.tsx's convention for the same ordering
// constraint (a plain top-level import would run before the mock consts are
// initialized, since jest.mock factories only see "mock"-prefixed
// identifiers that already exist when the mocked module is first required).
const { useGroupRowActions } = jest.requireActual<
  typeof import("../../../../src/features/groups/ui/group-row-actions")
>("../../../../src/features/groups/ui/group-row-actions");

function stateWithMembers(members: readonly (typeof member)[]): GroupsState {
  const base = initialGroupsState();
  return {
    ...base,
    detail: {
      ...base.detail,
      group,
      id: group.id,
      members: {
        error: null,
        items: members,
        loadingMore: false,
        nextCursor: null,
        status: "ready",
      },
      status: "ready",
    },
  };
}

/** Renders just the "소유권 이전" row action and `overlays` for the owned
 * `group` fixture -- the small test component the task calls for, instead of
 * the full group-list/group-detail screens. */
function Harness() {
  const { actionsFor, overlays } = useGroupRowActions();
  return (
    <>
      {actionsFor(group).map((action) => (
        <RNText
          key={action.key}
          onPress={action.onPress}
          testID={`row-action-${action.key}`}
        >
          {action.title}
        </RNText>
      ))}
      {overlays}
    </>
  );
}

describe("useGroupRowActions ownership-transfer picker (SHIP UX MEDIUM)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransferOwnership.mockResolvedValue(true);
  });

  test("소유권 이전 lists non-me rows hosted through ComposeRnHost and transfers after confirmation", async () => {
    const other = {
      ...member,
      nickname: "동료",
      role: "member" as const,
      userId: otherId,
    };
    mockGetState.mockReturnValue(stateWithMembers([member, other]));
    const screen = await render(
      <AppThemeProvider>
        <Harness />
      </AppThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId("row-action-transfer"));
    expect(screen.getByTestId("group-transfer-picker")).toBeTruthy();
    expect(screen.queryByTestId(`group-transfer-${userId}`)).toBeNull();
    const row = screen.getByTestId(`group-transfer-${otherId}`);
    expect(within(row).getByTestId("compose-rn-host")).toBeTruthy();

    await fireEvent.press(row);
    expect(screen.getByTestId("group-transfer-confirm")).toBeTruthy();
    expect(
      screen.getByText(
        "동료에게 소유권을 넘기면 나는 일반 멤버가 됩니다. 이전할까요?",
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "이전" }));
    expect(mockTransferOwnership).toHaveBeenCalledWith(otherId);
  });

  test("shows 소유권을 넘길 멤버가 없습니다 when the group has no other member", async () => {
    mockGetState.mockReturnValue(stateWithMembers([member]));
    const screen = await render(
      <AppThemeProvider>
        <Harness />
      </AppThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId("row-action-transfer"));
    expect(screen.getByText("소유권을 넘길 멤버가 없습니다.")).toBeTruthy();
  });
});
