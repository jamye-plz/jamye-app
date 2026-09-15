import { act, fireEvent, render } from "@testing-library/react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import {
  GroupListScreen,
  resolveGroupListContentPadding,
} from "@/features/groups/ui/group-list-screen";
import { GroupFormScreen } from "@/features/groups/ui/group-form-screen";
import {
  code,
  deferred,
  fakeGroupsApi,
  group,
  groupId,
  principal,
} from "../groups-fixtures";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useFocusEffect: (callback: () => () => void) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
  Stack: { Screen: () => null },
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
    await fireEvent.press(screen.getByRole("button", { name: /우리 그룹/ }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/groups/[groupId]",
      params: { groupId },
    });
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

describe("group list content padding", () => {
  it("reserves navigation-bar room on Android only", () => {
    expect(resolveGroupListContentPadding("android")).toBe(appSpacing.xxxl);
    expect(resolveGroupListContentPadding("ios")).toBe(appSpacing.md);
    expect(resolveGroupListContentPadding(undefined)).toBe(appSpacing.md);
  });
});
