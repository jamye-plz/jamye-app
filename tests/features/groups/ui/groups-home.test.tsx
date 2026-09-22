import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import {
  GroupListScreen,
  resolveGroupListErrorColor,
} from "@/features/groups/ui/group-list-screen";
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

describe("M7 home, create and join", () => {
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
  test("renders the canonical group list and navigates to a group on row press", async () => {
    const { screen } = await setup();
    expect(screen.getByTestId("group-list")).toBeTruthy();
    expect(screen.getByText(/^\d+ \/ \d+명$/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^우리 그룹, / }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/groups/[groupId]",
      params: { groupId },
    });
  });
  test("an owner's row offers 초대 코드 발급 and 소유권 이전, and the invite sheet opens on the opened group", async () => {
    const { screen, api } = await setup();
    expect(
      screen.queryByRole("button", { name: "우리 그룹 그룹 나가기" }),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "우리 그룹 초대 코드 발급" }),
    );
    expect(api.getGroup).toHaveBeenCalled();
    expect(await screen.findByTestId("group-owner-panel-issue")).toBeTruthy();
  });
  test("소유권 이전 lists the other members and transfers only after the confirmation", async () => {
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
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    try {
      const { screen } = await setup(undefined, api);
      await fireEvent.press(
        screen.getByRole("button", { name: "우리 그룹 소유권 이전" }),
      );
      const candidate = await screen.findByTestId(`group-transfer-${otherId}`);
      expect(screen.queryByTestId(`group-transfer-${userId}`)).toBeNull();
      await fireEvent.press(candidate);
      expect(alert).toHaveBeenCalledWith(
        "소유권 이전",
        expect.stringContaining("다른 사람"),
        expect.anything(),
      );
      expect(api.setMemberRole).not.toHaveBeenCalled();
      await act(async () => {
        alert.mock.calls[0]![2]![1]!.onPress?.();
      });
      await waitFor(() => expect(api.setMemberRole).toHaveBeenCalled());
      expect(api.setMemberRole.mock.calls[0]).toContain(otherId);
    } finally {
      alert.mockRestore();
    }
  });
  test("a member's row offers 그룹 나가기, which leaves only after the confirmation", async () => {
    const api = fakeGroupsApi();
    api.listGroups.mockResolvedValue({
      items: [{ ...group, ownerId: otherId }],
      nextCursor: null,
    });
    api.getGroup.mockResolvedValue({ ...group, ownerId: otherId });
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    try {
      const { screen } = await setup(undefined, api);
      expect(
        screen.queryByRole("button", { name: "우리 그룹 초대 코드 발급" }),
      ).toBeNull();
      await fireEvent.press(
        screen.getByRole("button", { name: "우리 그룹 그룹 나가기" }),
      );
      expect(api.removeMember).not.toHaveBeenCalled();
      await act(async () => {
        alert.mock.calls[0]![2]![1]!.onPress?.();
      });
      await waitFor(() => expect(api.removeMember).toHaveBeenCalled());
      expect(api.removeMember.mock.calls[0]).toContain(userId);
    } finally {
      alert.mockRestore();
    }
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
  test("distinguishes empty and failed initial query with explicit retry", async () => {
    const api = fakeGroupsApi();
    api.listGroups.mockRejectedValueOnce(
      new GroupsApiError(503, "groups_unavailable"),
    );
    const { screen } = await setup(undefined, api);
    expect(screen.getByText(/서버를 사용할 수 없습니다/)).toBeTruthy();
    api.listGroups.mockResolvedValueOnce({ items: [], nextCursor: null });
    await fireEvent.press(
      screen.getByRole("button", { name: "그룹 다시 불러오기" }),
    );
    expect(screen.getByText(/아직 가입한 그룹이 없습니다/)).toBeTruthy();
  });
  test("does not submit invalid names and awaits confirmed create before navigation", async () => {
    const { screen, api } = await setup("create");
    const submit = screen.getByRole("button", { name: "만들기" });
    expect(submit).toBeDisabled();
    await fireEvent.changeText(
      screen.getByLabelText("그룹 이름"),
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
  test("unknown create has a separate explicit repeat confirmation", async () => {
    const { screen, api } = await setup("create");
    api.createGroup.mockRejectedValueOnce(
      new GroupsApiError(408, "request_timeout"),
    );
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "우리 그룹");
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    expect(screen.getByText(/이미 만들어졌을 수 있습니다/)).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "중복 생성 가능성을 이해하고 다시 만들기",
      }),
    );
    expect(api.createGroup).toHaveBeenCalledTimes(2);
  });
  test("joins an already-member group only after G3; no invite code in navigation", async () => {
    const { screen } = await setup("join");
    await fireEvent.changeText(screen.getByLabelText("초대 코드"), code);
    await fireEvent.press(screen.getByRole("button", { name: "가입하기" }));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/groups/[groupId]",
      params: { groupId },
    });
    expect(JSON.stringify(mockReplace.mock.calls)).not.toContain(code);
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
      await fireEvent.changeText(screen.getByLabelText("초대 코드"), code);
      await fireEvent.press(screen.getByRole("button", { name: "가입하기" }));
      expect(screen.getByText(message)).toBeTruthy();
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );
  test("leaving a form fences late navigation", async () => {
    const { screen, api } = await setup("create");
    const pending = deferred<typeof group>();
    api.createGroup.mockReturnValueOnce(pending.promise);
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "이름");
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    await screen.unmount();
    await act(async () => {
      pending.resolve(group);
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
  test("join button honors Retry-After without automatically replaying", async () => {
    jest.useFakeTimers();
    try {
      const { screen, api } = await setup("join");
      api.joinByInvite.mockRejectedValueOnce(
        new GroupsApiError(429, "rate_limit_exceeded", 2),
      );
      await fireEvent.changeText(screen.getByLabelText("초대 코드"), code);
      await fireEvent.press(screen.getByRole("button", { name: "가입하기" }));
      expect(screen.getByRole("button", { name: "가입하기" })).toBeDisabled();
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.getByRole("button", { name: "가입하기" })).toBeEnabled();
      expect(api.joinByInvite).toHaveBeenCalledTimes(1);
      await screen.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("group list error color for @expo/ui text", () => {
  it("uses UIKit systemRed per scheme on iOS and the Material error on Android", () => {
    expect(resolveGroupListErrorColor("ios", "light")).toBe("#FF3B30");
    expect(resolveGroupListErrorColor("ios", "dark")).toBe("#FF453A");
    expect(resolveGroupListErrorColor("android", "light")).toBe("#BA1A1A");
    expect(resolveGroupListErrorColor("android", "dark")).toBe("#FFB4AB");
  });
});
