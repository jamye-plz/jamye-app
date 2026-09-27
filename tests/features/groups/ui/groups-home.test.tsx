import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Share } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import { GroupListScreen } from "@/features/groups/ui/group-list-screen";
import { GroupFormScreen } from "@/features/groups/ui/group-form-screen";
import {
  code,
  deferred,
  fakeGroupsApi,
  group,
  groupId,
  member,
  otherId,
  principal,
  userId,
} from "../groups-fixtures";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";

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

// C2's centered `ConfirmAlert` (G6/G7 transfer/leave) and C1's
// `StandardStateView` (empty/error/loading) both render through
// `@expo/ui/swift-ui` -- one inline mock per the shared test rule (no global
// auto-mock for swift-ui/jetpack-compose).
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
  function Button(
    props: Readonly<{
      label?: string;
      onPress?: () => void;
      role?: string;
    }>,
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
    props: Readonly<{
      description?: string;
      systemImage?: string;
      title?: string;
    }>,
  ) {
    return (
      <View accessibilityHint={props.systemImage} testID="content-unavailable">
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
  function Form({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  function Section({
    children,
    footer,
  }: MockChildren & { footer?: ReactNode }) {
    return (
      <View>
        {children}
        {footer}
      </View>
    );
  }
  function TextField(
    props: Readonly<{
      autoFocus?: boolean;
      modifiers?: { $type?: string; value?: boolean }[];
      onTextChange?: (value: string) => void;
      placeholder?: string;
      text?: MockObservableState;
    }>,
  ) {
    const isDisabled = props.modifiers?.some(
      (modifier) => modifier.$type === "disabled" && modifier.value,
    );
    return (
      <TextInput
        autoFocus={props.autoFocus}
        defaultValue={props.text?.value}
        editable={!isDisabled}
        onChangeText={props.onTextChange}
        placeholder={props.placeholder}
        testID="group-form-field"
      />
    );
  }
  return {
    Alert,
    Button,
    ContentUnavailableView,
    Form,
    ProgressView,
    Section,
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

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useFocusEffect: (callback: () => () => void) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
  Stack: {
    Screen: () => null,
    ...jest
      .requireActual<typeof import("../../../support/stack-toolbar-mock")>(
        "../../../support/stack-toolbar-mock",
      )
      .createStackToolbarMock(),
  },
}));
const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);

describe("M14 groups home, create and join", () => {
  beforeEach(() => jest.clearAllMocks());
  async function setup(mode?: "create" | "join", api = fakeGroupsApi()) {
    const store = createGroupsStore({ createApi: () => api });
    const screen = await render(
      <AppThemeProvider>
        <GroupsProvider
          origin={principal.origin}
          principal={principal}
          authorizedRequest={authorized}
          createStore={() => store}
        >
          {mode ? <GroupFormScreen mode={mode} /> : <GroupListScreen />}
        </GroupsProvider>
      </AppThemeProvider>,
    );
    return { screen, api, store };
  }
  test("renders the canonical group list (G1: monogram avatar, n/max, 소유자) and navigates on row press", async () => {
    const { screen } = await setup();
    expect(screen.getByTestId("group-list")).toBeTruthy();
    expect(screen.getByText(/^\d+ \/ \d+명 · 소유자$/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^우리 그룹, / }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/groups/[groupId]",
      params: { groupId },
    });
  });
  test("an owner's row offers 초대 링크 공유 (G5: 7-day unlimited invite, https link + code, 7일 valid) and 소유권 이전", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction" });
    const { screen, api } = await setup();
    expect(
      screen.queryByRole("button", { name: "우리 그룹 그룹 나가기" }),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "우리 그룹 초대 링크 공유" }),
    );
    await waitFor(() => expect(api.createInvite).toHaveBeenCalled());
    expect(api.createInvite.mock.calls[0][2]).toMatchObject({ maxUses: null });
    await waitFor(() => expect(share).toHaveBeenCalled());
    const message = share.mock.calls[0]![0]!.message as string;
    expect(message).toContain(`/invite/${code}`);
    expect(message).toContain(code);
    expect(message).toContain("7일");
    share.mockRestore();
  });
  test("초대 링크 공유 shows a centered retry alert when invite creation fails", async () => {
    const api = fakeGroupsApi();
    api.createInvite.mockRejectedValueOnce(
      new GroupsApiError(503, "group_unavailable"),
    );
    const { screen } = await setup(undefined, api);
    await fireEvent.press(
      screen.getByRole("button", { name: "우리 그룹 초대 링크 공유" }),
    );
    await waitFor(() =>
      expect(screen.getByText("초대 링크를 만들지 못했습니다")).toBeTruthy(),
    );
  });
  test("소유권 이전 lists the other members and transfers only after the centered confirmation", async () => {
    const api = fakeGroupsApi();
    const other = {
      ...member,
      nickname: "다른 사람",
      role: "member" as const,
      userId: otherId,
    };
    api.listMembers.mockResolvedValue({
      items: [member, other],
      nextCursor: null,
    });
    const { screen, api: usedApi } = await setup(undefined, api);
    await fireEvent.press(
      screen.getByRole("button", { name: "우리 그룹 소유권 이전" }),
    );
    const candidate = await screen.findByTestId(`group-transfer-${otherId}`);
    expect(screen.queryByTestId(`group-transfer-${userId}`)).toBeNull();
    await fireEvent.press(candidate);
    expect(screen.getByText("소유권 이전")).toBeTruthy();
    expect(screen.getByText(/다른 사람/)).toBeTruthy();
    expect(usedApi.setMemberRole).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "이전" }));
    await waitFor(() => expect(usedApi.setMemberRole).toHaveBeenCalled());
    expect(usedApi.setMemberRole.mock.calls[0]).toContain(otherId);
  });
  test("a member's row offers 그룹 나가기, which leaves only after the centered confirmation", async () => {
    const api = fakeGroupsApi();
    api.listGroups.mockResolvedValue({
      items: [{ ...group, ownerId: otherId }],
      nextCursor: null,
    });
    api.getGroup.mockResolvedValue({ ...group, ownerId: otherId });
    const { screen, api: usedApi } = await setup(undefined, api);
    expect(
      screen.queryByRole("button", { name: "우리 그룹 초대 링크 공유" }),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "우리 그룹 그룹 나가기" }),
    );
    expect(screen.getByText("그룹 나가기")).toBeTruthy();
    expect(usedApi.removeMember).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "나가기" }));
    await waitFor(() => expect(usedApi.removeMember).toHaveBeenCalled());
    expect(usedApi.removeMember.mock.calls[0]).toContain(userId);
  });
  test("pull-to-refresh on the native list reloads the groups", async () => {
    const { screen, api } = await setup();
    expect(api.listGroups).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId("group-list"), "refresh");
    expect(api.listGroups).toHaveBeenCalledTimes(2);
  });
  test("the + header menu offers create and join as native menu items", async () => {
    const { screen } = await setup();
    expect(screen.getByRole("button", { name: "그룹 추가" })).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("menuitem", { name: "새 그룹 만들기" }),
    );
    expect(mockPush).toHaveBeenLastCalledWith("/groups/create");
    await fireEvent.press(
      screen.getByRole("menuitem", { name: "초대 코드로 가입" }),
    );
    expect(mockPush).toHaveBeenLastCalledWith("/groups/join");
  });
  test("distinguishes empty (G4: two entry-point buttons) and failed initial query with explicit retry", async () => {
    const api = fakeGroupsApi();
    api.listGroups.mockRejectedValueOnce(
      new GroupsApiError(503, "groups_unavailable"),
    );
    const { screen } = await setup(undefined, api);
    expect(screen.getByText(/서버를 사용할 수 없습니다/)).toBeTruthy();
    api.listGroups.mockResolvedValueOnce({ items: [], nextCursor: null });
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(screen.getByText(/아직 가입한 그룹이 없습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "새 그룹 만들기" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "초대 코드로 가입" }),
    ).toBeTruthy();
  });
  test("does not submit invalid names and awaits confirmed create before navigation (detailed C3 UI mechanics: group-form-screen.test.tsx)", async () => {
    const { screen, api } = await setup("create");
    const submit = screen.getByRole("button", { name: "만들기" });
    expect(submit).toBeDisabled();
    await fireEvent.changeText(
      screen.getByPlaceholderText("그룹 이름"),
      "😀".repeat(128),
    );
    const pending = deferred<typeof group>();
    api.createGroup.mockReturnValueOnce(pending.promise);
    await fireEvent.press(submit);
    await fireEvent.press(submit);
    expect(api.createGroup).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(group);
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/groups/[groupId]",
      params: { groupId },
    });
  });
  test("joins an already-member group only after explicit submit; no invite code anywhere in navigation", async () => {
    const { screen } = await setup("join");
    await fireEvent.changeText(screen.getByPlaceholderText("초대 코드"), code);
    await fireEvent.press(screen.getByRole("button", { name: "가입" }));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/groups/[groupId]",
      params: { groupId },
    });
    expect(JSON.stringify(mockPush.mock.calls)).not.toContain(code);
    expect(JSON.stringify(mockReplace.mock.calls)).not.toContain(code);
    expect(JSON.stringify(mockBack.mock.calls)).not.toContain(code);
  });
  test.each([
    [404, "invite_not_found", /초대 코드를 찾을 수 없습니다/],
    [410, "invite_expired", /만료된 초대 코드/],
    [410, "invite_exhausted", /사용 횟수를 모두 소진/],
    [409, "group_full", /그룹 정원/],
    [429, "rate_limit_exceeded", /잠시 후/],
  ] as const)(
    "shows distinct join outcome %s %s",
    async (status, errorCode, message) => {
      const { screen, api } = await setup("join");
      api.joinByInvite.mockRejectedValueOnce(
        new GroupsApiError(status, errorCode),
      );
      await fireEvent.changeText(
        screen.getByPlaceholderText("초대 코드"),
        code,
      );
      await fireEvent.press(screen.getByRole("button", { name: "가입" }));
      expect(screen.getByText(message)).toBeTruthy();
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );
  test("leaving a form fences late navigation", async () => {
    const { screen, api } = await setup("create");
    const pending = deferred<typeof group>();
    api.createGroup.mockReturnValueOnce(pending.promise);
    await fireEvent.changeText(
      screen.getByPlaceholderText("그룹 이름"),
      "이름",
    );
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    await screen.unmount();
    await act(async () => {
      pending.resolve(group);
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
