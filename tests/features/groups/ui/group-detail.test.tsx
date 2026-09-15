import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert, Share } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";
import { GroupDetailScreen } from "@/features/groups/ui/group-detail-screen";
import {
  code,
  deferred,
  fakeGroupsApi,
  group,
  groupId,
  otherId,
  principal,
  userId,
} from "../groups-fixtures";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockStackScreen = jest.fn(
  (_props: Readonly<{ options: { title?: string } }>) => null,
);
jest.mock("expo-router", () => ({
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
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => ({
    principal: { userId: "22222222-2222-4222-8222-222222222222" },
  }),
}));
// react-test-renderer's native-component mock for RefreshControl filters
// props down to the codegen'd iOS/Android ViewConfig, silently dropping
// `testID` (and even `refreshing`) before they reach the tree. Mock only
// this submodule (not the whole "react-native" barrel, which has native
// module side effects on require) with a plain View that keeps those props
// queryable/fireable in tests.
jest.mock(
  "react-native/Libraries/Components/RefreshControl/RefreshControl",
  () => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return {
      __esModule: true,
      default: (
        props: Readonly<{
          onRefresh?: () => void;
          refreshing: boolean;
          testID?: string;
        }>,
      ) => (
        <View
          // @ts-expect-error -- test-only passthrough so fireEvent(el, "refresh")
          // reaches the real handler; not a real View prop.
          onRefresh={props.onRefresh}
          refreshing={props.refreshing}
          testID={props.testID}
        />
      ),
    };
  },
);
const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);
function lastStackScreenTitle(): string | undefined {
  return mockStackScreen.mock.calls.at(-1)?.[0].options.title;
}

describe("M7 group detail management UI", () => {
  beforeEach(() => jest.clearAllMocks());
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
  test("owner sees canonical detail, roster and owner actions", async () => {
    const { screen, api } = await setup();
    expect(lastStackScreenTitle()).toBe("우리 그룹");
    expect(screen.getByText("사용자")).toBeTruthy();
    expect(screen.getByText("소유자")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText("새 그룹 이름"),
      "새 이름",
    );
    await fireEvent.press(screen.getByRole("button", { name: "이름 변경" }));
    expect(api.renameGroup).toHaveBeenCalledWith(
      "fake",
      groupId,
      { name: "새 이름" },
      expect.anything(),
    );
  });
  test("member sees self leave but no owner controls", async () => {
    const api = fakeGroupsApi();
    api.getGroup.mockResolvedValue({ ...group, ownerId: otherId });
    const { screen } = await setup(api);
    expect(screen.getByRole("button", { name: "그룹 나가기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "그룹 삭제" })).toBeNull();
    expect(screen.queryByRole("button", { name: "초대 코드 발급" })).toBeNull();
  });
  test("the loaded group opens its own connected room list", async () => {
    const { screen } = await setup();
    await fireEvent.press(screen.getByRole("button", { name: "주제" }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/groups/[groupId]/chatrooms",
      params: { groupId },
    });
  });
  test("manual refresh keeps detail visible, shows a transient error and allows retry", async () => {
    const { api, screen } = await setup();
    const response = deferred<typeof group>();
    api.getGroup.mockReturnValueOnce(response.promise);
    await fireEvent(screen.getByTestId("group-detail-refresh"), "refresh");
    expect(lastStackScreenTitle()).toBe("우리 그룹");
    expect(screen.getByText("사용자")).toBeTruthy();
    expect(screen.getByText("소유자")).toBeTruthy();
    expect(screen.getByTestId("group-detail-refresh").props.refreshing).toBe(
      true,
    );
    await act(async () => {
      response.reject(new GroupsApiError(503, "group_unavailable"));
    });
    expect(lastStackScreenTitle()).toBe("우리 그룹");
    expect(screen.queryByRole("button", { name: "그룹 다시 확인" })).toBeNull();
    await fireEvent(screen.getByTestId("group-detail-refresh"), "refresh");
    expect(api.getGroup).toHaveBeenCalledTimes(3);
  });
  test("delete needs explicit confirmation and cancelled dialog sends no request", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const { screen, api } = await setup();
    await fireEvent.press(screen.getByRole("button", { name: "그룹 삭제" }));
    expect(api.deleteGroup).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons[0].style).toBe("cancel");
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(api.deleteGroup).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/");
    alert.mockRestore();
  });
  test("an old confirmation cannot mutate another route after unmount", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const { screen, api } = await setup();
    await fireEvent.press(screen.getByRole("button", { name: "그룹 삭제" }));
    const confirm = alert.mock.calls[0][2]![1].onPress;
    await screen.unmount();
    await act(async () => {
      confirm?.();
    });
    expect(api.deleteGroup).not.toHaveBeenCalled();
    alert.mockRestore();
  });
  test("owner transfer and member removal require confirmation", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
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
    const { screen } = await setup(api);
    await fireEvent.press(screen.getByRole("button", { name: "멤버 관리" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "멤버에게 소유권 이전" }),
    );
    await act(async () => {
      alert.mock.calls[0][2]![1].onPress?.();
    });
    expect(api.setMemberRole).toHaveBeenCalledWith(
      "fake",
      groupId,
      otherId,
      { role: "owner" },
      expect.anything(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "멤버 관리" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "멤버 내보내기" }),
    );
    await act(async () => {
      alert.mock.calls[1][2]![1].onPress?.();
    });
    expect(api.removeMember).toHaveBeenCalledWith(
      "fake",
      groupId,
      otherId,
      expect.anything(),
    );
    alert.mockRestore();
  });
  test("ephemeral invite is selectable, explicitly shareable and clearable", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction" });
    const { screen, store } = await setup();
    await fireEvent.press(
      screen.getByRole("button", { name: "초대 코드 발급" }),
    );
    await fireEvent.press(screen.getByTestId("group-owner-panel-issue"));
    expect(screen.getByText(code).props.selectable).toBe(true);
    await fireEvent.press(
      screen.getByRole("button", { name: "초대 코드 공유" }),
    );
    expect(share).toHaveBeenCalledWith({ message: code });
    await fireEvent.press(
      screen.getByRole("button", { name: "초대 코드 숨기기" }),
    );
    expect(store.getState().invite).toBeNull();
    share.mockRestore();
  });
  test("terminal access loss hides all group data", async () => {
    const api = fakeGroupsApi();
    api.getGroup.mockRejectedValue(
      new GroupsApiError(403, "membership_required"),
    );
    const { screen } = await setup(api);
    expect(lastStackScreenTitle()).toBe("그룹");
    expect(screen.getByText(/이 그룹에 접근할 수 없습니다/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "그룹 삭제" })).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
  test("invalid route id never triggers a group request", async () => {
    const { api, screen } = await setup(fakeGroupsApi(), "..");
    expect(api.getGroup).not.toHaveBeenCalled();
    expect(screen.getByText(/올바르지 않은 그룹/)).toBeTruthy();
  });
  test("self-leave confirmation uses current validated user identity", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const api = fakeGroupsApi();
    api.getGroup.mockResolvedValue({ ...group, ownerId: otherId });
    const { screen } = await setup(api);
    await fireEvent.press(screen.getByRole("button", { name: "그룹 나가기" }));
    await act(async () => {
      alert.mock.calls[0][2]![1].onPress?.();
    });
    expect(api.removeMember).toHaveBeenCalledWith(
      "fake",
      groupId,
      userId,
      expect.anything(),
    );
    alert.mockRestore();
  });
});
