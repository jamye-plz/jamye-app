import { act, fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";
import { GroupRenameScreen } from "@/features/groups/ui/group-rename-screen";
import GroupRenameRoute from "@/app/groups/[groupId]/rename";
import {
  deferred,
  fakeGroupsApi,
  group,
  groupId,
  principal,
} from "../groups-fixtures";

// C3: the sheet renders through the shared shell test double (its native
// rendering is covered by native-input-shell.test.tsx).
jest.mock("@/shared/ui/native-input-sheet", () => ({
  NativeInputSheet: jest.requireActual<
    typeof import("../../../support/native-input-shell-mock")
  >("../../../support/native-input-shell-mock").NativeInputShellMock,
}));
jest.mock("@/shared/ui/native-input-dialog", () => ({
  NativeInputDialog: jest.requireActual<
    typeof import("../../../support/native-input-shell-mock")
  >("../../../support/native-input-shell-mock").NativeInputShellMock,
}));
// The route's guard is covered by its own tests; here it only has to wrap
// the sheet.
jest.mock("@/features/groups/ui/group-route-guard", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    GroupRouteGuard: ({ children }: Readonly<{ children?: ReactNode }>) => (
      <View testID="group-route-guard">{children}</View>
    ),
  };
});
const mockBack = jest.fn();
let mockParams: Record<string, string | string[]> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack }),
  useFocusEffect: (callback: () => () => void) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
}));

const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);

describe("I3 group rename sheet (M17/U11)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  // The iOS group info screen opens the detail, then presents this sheet
  // and hands the open detail over (group-detail.test.tsx covers that
  // handoff); `open: false` is a sheet whose detail was never opened.
  async function setup(api = fakeGroupsApi(), open = true) {
    const store = createGroupsStore({ createApi: () => api });
    const tree = (child: ReactNode) => (
      <GroupsProvider
        origin={principal.origin}
        principal={principal}
        authorizedRequest={authorized}
        createStore={() => store}
      >
        {child}
      </GroupsProvider>
    );
    const screen = await render(tree(null));
    if (open) {
      await act(async () => {
        await store.actions.openGroup(groupId);
      });
    }
    await screen.rerender(tree(<GroupRenameScreen groupId={groupId} />));
    return { api, screen, store, tree };
  }

  test("opens titled and prefilled with the current name; 저장 waits for a changed, valid name", async () => {
    const { screen } = await setup();
    expect(screen.getByRole("header", { name: "그룹 이름 변경" })).toBeTruthy();
    const field = screen.getByLabelText("그룹 이름");
    expect(field.props.accessibilityHint).toBe(group.name);
    expect(
      screen.getByText(
        "이름은 1~128자입니다. 입력한 공백도 그대로 사용합니다.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("저장")).toBeDisabled();
    await fireEvent.changeText(field, "");
    expect(screen.getByLabelText("저장")).toBeDisabled();
    await fireEvent.changeText(field, "새 이름");
    expect(screen.getByLabelText("저장")).toBeEnabled();
  });

  test("saves through renameGroup and closes the sheet on success", async () => {
    const { api, screen } = await setup();
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "새 이름");
    await fireEvent.press(screen.getByLabelText("저장"));
    expect(api.renameGroup).toHaveBeenCalledWith(
      "fake",
      groupId,
      { name: "새 이름" },
      expect.anything(),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("keeps the sheet open with the failure in the footer; editing clears it", async () => {
    const api = fakeGroupsApi();
    api.renameGroup.mockRejectedValueOnce(
      new GroupsApiError(403, "owner_required"),
    );
    const { screen } = await setup(api);
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "새 이름");
    await fireEvent.press(screen.getByLabelText("저장"));
    expect(
      screen.getByText(
        "그룹 소유자만 할 수 있습니다. 현재 권한을 다시 확인합니다.",
      ),
    ).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "새 이름2");
    expect(
      screen.queryByText(
        "그룹 소유자만 할 수 있습니다. 현재 권한을 다시 확인합니다.",
      ),
    ).toBeNull();
  });

  test("an earlier management failure on the info screen does not show in a fresh sheet", async () => {
    const api = fakeGroupsApi();
    api.createInvite.mockRejectedValueOnce(
      new GroupsApiError(403, "owner_required"),
    );
    const store = createGroupsStore({ createApi: () => api });
    const tree = (child: ReactNode) => (
      <GroupsProvider
        origin={principal.origin}
        principal={principal}
        authorizedRequest={authorized}
        createStore={() => store}
      >
        {child}
      </GroupsProvider>
    );
    const screen = await render(tree(null));
    await act(async () => {
      await store.actions.openGroup(groupId);
      await store.actions.createInvite({});
    });
    expect(store.getState().management.status).toBe("failed");
    await screen.rerender(tree(<GroupRenameScreen groupId={groupId} />));
    expect(
      screen.getByText(
        "이름은 1~128자입니다. 입력한 공백도 그대로 사용합니다.",
      ),
    ).toBeTruthy();
  });

  test("a sheet swiped away mid-request never pops the info screen below", async () => {
    const api = fakeGroupsApi();
    const pending = deferred<typeof group>();
    api.renameGroup.mockReturnValueOnce(pending.promise);
    const { screen, tree } = await setup(api);
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "새 이름");
    await fireEvent.press(screen.getByLabelText("저장"));
    expect(screen.getByLabelText("취소")).toBeDisabled();
    // The mocked useFocusEffect is a plain effect, so unmounting the sheet
    // (the provider stays mounted) runs the same cleanup a swipe-away does.
    await screen.rerender(tree(null));
    await act(async () => {
      pending.resolve({ ...group, name: "새 이름" });
      await pending.promise;
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("keeps what the user typed when the detail reloads, and waits for it before 저장", async () => {
    const { screen, store } = await setup();
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "새 이름");
    await act(async () => {
      store.actions.background();
    });
    expect(screen.getByLabelText("저장")).toBeDisabled();
    await act(async () => {
      await store.actions.foreground();
    });
    expect(screen.getByLabelText("그룹 이름").props.value).toBe("새 이름");
    expect(screen.getByLabelText("저장")).toBeEnabled();
  });

  test("a sheet whose detail was never opened keeps 저장 disabled", async () => {
    const { api, screen } = await setup(fakeGroupsApi(), false);
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "새 이름");
    expect(screen.getByLabelText("저장")).toBeDisabled();
    expect(api.renameGroup).not.toHaveBeenCalled();
  });
});

describe("I3 group rename route (M17/U11)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  async function renderRoute(params: Record<string, string | string[]>) {
    mockParams = params;
    const store = createGroupsStore({ createApi: () => fakeGroupsApi() });
    const tree = (child: ReactNode) => (
      <GroupsProvider
        origin={principal.origin}
        principal={principal}
        authorizedRequest={authorized}
        createStore={() => store}
      >
        {child}
      </GroupsProvider>
    );
    const screen = await render(tree(null));
    await act(async () => {
      await store.actions.openGroup(groupId);
    });
    await screen.rerender(tree(<GroupRenameRoute />));
    return screen;
  }

  test("renders the sheet for the route's groupId inside the group route guard", async () => {
    const screen = await renderRoute({ groupId });
    expect(screen.getByTestId("group-route-guard")).toBeTruthy();
    expect(screen.getByRole("header", { name: "그룹 이름 변경" })).toBeTruthy();
    expect(screen.getByLabelText("그룹 이름").props.accessibilityHint).toBe(
      group.name,
    );
  });

  test("a repeated groupId param renames nothing: the sheet opens with 저장 disabled", async () => {
    const screen = await renderRoute({ groupId: [groupId, groupId] });
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "새 이름");
    expect(screen.getByLabelText("저장")).toBeDisabled();
  });
});
