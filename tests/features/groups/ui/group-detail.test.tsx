import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Share } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";
import { GroupDetailScreen } from "@/features/groups/ui/group-detail-screen";
import {
  code,
  fakeGroupsApi,
  group,
  groupId,
  otherId,
  principal,
  userId,
} from "../groups-fixtures";

jest.mock("@/shared/ui/action-list-item", () =>
  jest
    .requireActual<typeof import("../../../support/action-list-item-mock")>(
      "../../../support/action-list-item-mock",
    )
    .createActionListItemMock(),
);
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => ({
    principal: { userId: "22222222-2222-4222-8222-222222222222" },
  }),
}));

// I3's rename dialog (`Alert` + `TextField`) and I4/I6's `ConfirmAlert`
// (destructive confirmations) both render through `@expo/ui/swift-ui` (jest
// always resolves "ios"). C1's `StandardStateView` also lives here. One
// inline mock per the shared test rule.
jest.mock("@expo/ui/swift-ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text, TextInput, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyPressable = Pressable as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  type MockChildren = Readonly<{ children?: ReactNode; testID?: string }>;
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
    function MockSlot({ children }: MockChildren) {
      return <View>{children}</View>;
    };
  Alert.Trigger = slot();
  Alert.Actions = slot();
  Alert.Message = slot();
  function AlertButton(
    props: Readonly<{ label?: string; onPress?: () => void; role?: string }>,
  ) {
    return (
      <AnyPressable
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
  function MockText({ children }: MockChildren) {
    return <Text>{children}</Text>;
  }
  function VStack({ children, testID }: MockChildren) {
    return <View testID={testID}>{children}</View>;
  }
  function ProgressView() {
    return <View testID="progress-view" />;
  }
  function ContentUnavailableView(
    props: Readonly<{ description?: string; title?: string }>,
  ) {
    return (
      <View testID="content-unavailable">
        <Text accessibilityRole="header">{props.title}</Text>
        {props.description ? <Text>{props.description}</Text> : null}
      </View>
    );
  }
  type MockObservableState = {
    value: string;
    get: () => string;
    set: jest.Mock;
  };
  function useNativeState(initial: string): MockObservableState {
    const ref = React.useRef<MockObservableState | null>(null);
    if (!ref.current) {
      const state: MockObservableState = {
        value: initial,
        get: () => state.value,
        set: jest.fn((next: string) => {
          state.value = next;
        }),
      };
      ref.current = state;
    }
    return ref.current;
  }
  function TextField(props: Readonly<{ text?: MockObservableState }>) {
    return (
      <TextInput
        defaultValue={props.text?.value}
        onChangeText={props.text?.set}
        testID="rename-field"
      />
    );
  }
  return {
    Alert,
    Button: AlertButton,
    ContentUnavailableView,
    ProgressView,
    Spacer,
    Text: MockText,
    TextField,
    useNativeState,
    VStack,
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  buttonStyle: (value: string) => ({ $type: "buttonStyle", value }),
  disabled: (value: boolean) => ({ $type: "disabled", value }),
  fixedSize: (value: unknown) => ({ $type: "fixedSize", value }),
  frame: (value: unknown) => ({ $type: "frame", value }),
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockStackScreen = jest.fn(
  (_props: Readonly<{ options: { title?: string } }>) => null,
);
let mockFocused = true;
jest.mock("expo-router", () => ({
  useIsFocused: () => mockFocused,
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useFocusEffect: (callback: () => () => void) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
  Stack: {
    Screen: (props: Readonly<{ options: { title?: string } }>) =>
      mockStackScreen(props),
  },
}));
const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);
function lastStackScreenTitle(): string | undefined {
  return mockStackScreen.mock.calls.at(-1)?.[0].options.title;
}

describe("I1-I6 group detail (info)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
  });
  async function setup(api = fakeGroupsApi(), id = groupId) {
    const store = createGroupsStore({ createApi: () => api });
    const screen = await render(
      <AppThemeProvider>
        <GroupsProvider
          origin={principal.origin}
          principal={principal}
          authorizedRequest={authorized}
          createStore={() => store}
        >
          <GroupDetailScreen groupId={id} />
        </GroupsProvider>
      </AppThemeProvider>,
    );
    return { api, store, screen };
  }

  test("I2: owner sees the summary header, roster (I4) and owner-only 관리/삭제 rows", async () => {
    const { screen } = await setup();
    expect(lastStackScreenTitle()).toBe("그룹 정보");
    expect(screen.getAllByText("우리 그룹").length).toBeGreaterThan(0);
    expect(screen.getByText("멤버 2/10 · 소유자")).toBeTruthy();
    expect(screen.getByText("사용자 (나)")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "그룹 이름, 우리 그룹" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "초대 링크 공유" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "그룹 삭제" })).toBeTruthy();
  });

  test("keeps drawing the last detail once unfocused, so closeGroup during the pop does not rebuild the list", async () => {
    const { screen, store } = await setup();
    expect(screen.getByText("멤버 2/10 · 소유자")).toBeTruthy();
    mockFocused = false;
    await act(async () => {
      store.actions.closeGroup();
    });
    expect(store.getState().detail.group).toBeNull();
    expect(screen.getByText("멤버 2/10 · 소유자")).toBeTruthy();
    expect(screen.queryByTestId("group-detail-loading")).toBeNull();
  });

  test("I4: a member sees 그룹 나가기 but no owner-only 관리/삭제 rows", async () => {
    const api = fakeGroupsApi();
    api.getGroup.mockResolvedValue({ ...group, ownerId: otherId });
    const { screen } = await setup(api);
    expect(screen.getByRole("button", { name: "그룹 나가기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "그룹 삭제" })).toBeNull();
    expect(screen.queryByRole("button", { name: "초대 링크 공유" })).toBeNull();
  });

  test("I3: 그룹 이름 opens the rename dialog, prefilled with the current name; save renames", async () => {
    const { screen, api } = await setup();
    await fireEvent.press(
      screen.getByRole("button", { name: "그룹 이름, 우리 그룹" }),
    );
    expect(screen.getByText("그룹 이름 변경")).toBeTruthy();
    expect(screen.getByTestId("rename-field").props.defaultValue).toBe(
      "우리 그룹",
    );
    await fireEvent.changeText(screen.getByTestId("rename-field"), "새 이름");
    await fireEvent.press(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(api.renameGroup).toHaveBeenCalledWith(
        "fake",
        groupId,
        { name: "새 이름" },
        expect.anything(),
      ),
    );
  });

  test("manual refresh keeps the detail visible and reloads on pull-to-refresh", async () => {
    const { api, screen } = await setup();
    expect(api.getGroup).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId("group-detail-list"), "refresh");
    expect(api.getGroup).toHaveBeenCalledTimes(2);
  });

  test("I6: delete needs a centered confirmation and a cancelled dialog sends no request", async () => {
    const { screen, api } = await setup();
    await fireEvent.press(screen.getByRole("button", { name: "그룹 삭제" }));
    expect(screen.getAllByText("그룹 삭제").length).toBeGreaterThan(1);
    expect(api.deleteGroup).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(api.deleteGroup).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  test("I4: owner transfer and member removal on another member's row require confirmation", async () => {
    const api = fakeGroupsApi();
    api.listMembers.mockResolvedValue({
      items: [
        {
          userId: otherId,
          nickname: "멤버",
          role: "member",
          joinedAt: group.createdAt,
          avatarUrl: null,
        },
      ],
      nextCursor: null,
    });
    const { screen, api: usedApi } = await setup(api);
    await fireEvent.press(
      screen.getByRole("button", { name: "멤버 소유권 이전" }),
    );
    expect(screen.getByText("소유권 이전")).toBeTruthy();
    expect(usedApi.setMemberRole).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "이전" }));
    await waitFor(() =>
      expect(usedApi.setMemberRole).toHaveBeenCalledWith(
        "fake",
        groupId,
        otherId,
        { role: "owner" },
        expect.anything(),
      ),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "멤버 내보내기" }),
    );
    expect(screen.getByText("멤버 내보내기")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "내보내기" }));
    await waitFor(() =>
      expect(usedApi.removeMember).toHaveBeenCalledWith(
        "fake",
        groupId,
        otherId,
        expect.anything(),
      ),
    );
  });

  test("an old confirmation cannot mutate another route after unmount", async () => {
    const { screen, api } = await setup();
    await fireEvent.press(screen.getByRole("button", { name: "그룹 삭제" }));
    await screen.unmount();
    await act(async () => {
      // The confirm alert's onConfirm captured `lifetime` before unmount;
      // GroupDetailScreen itself clears it in the focus-effect cleanup, so
      // there is nothing left to press -- this documents that unmounting
      // does not leave a pending mutation path reachable.
    });
    expect(api.deleteGroup).not.toHaveBeenCalled();
  });

  test("초대 링크 공유 creates a 7-day unlimited invite and shares the https link and code", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction" });
    const { screen, api } = await setup();
    await fireEvent.press(
      screen.getByRole("button", { name: "초대 링크 공유" }),
    );
    await waitFor(() => expect(api.createInvite).toHaveBeenCalled());
    expect(api.createInvite.mock.calls[0][2]).toMatchObject({
      maxUses: null,
    });
    await waitFor(() => expect(share).toHaveBeenCalled());
    const message = share.mock.calls[0]![0]!.message as string;
    expect(message).toContain(`/invite/${code}`);
    expect(message).toContain(code);
    expect(message).toContain("7일");
    share.mockRestore();
  });

  test("초대 링크 공유 shows a retry message when invite creation fails", async () => {
    const api = fakeGroupsApi();
    api.createInvite.mockRejectedValueOnce(
      new GroupsApiError(503, "group_unavailable"),
    );
    const { screen } = await setup(api);
    await fireEvent.press(
      screen.getByRole("button", { name: "초대 링크 공유" }),
    );
    await waitFor(() =>
      expect(screen.getByText("초대 링크를 만들지 못했습니다")).toBeTruthy(),
    );
  });

  test("terminal access loss hides all group data and offers no retry", async () => {
    const api = fakeGroupsApi();
    api.getGroup.mockRejectedValue(
      new GroupsApiError(403, "membership_required"),
    );
    const { screen } = await setup(api);
    await waitFor(() =>
      expect(screen.getByTestId("content-unavailable")).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(screen.queryByText(userId)).toBeNull();
  });

  test("an invalid group id shows an error state without ever calling the API", async () => {
    const { screen, api } = await setup(fakeGroupsApi(), "not-a-uuid");
    expect(screen.getByText("올바르지 않은 그룹 주소입니다")).toBeTruthy();
    expect(api.getGroup).not.toHaveBeenCalled();
  });
});
