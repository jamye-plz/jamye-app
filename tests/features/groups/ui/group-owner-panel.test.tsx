import { fireEvent, render } from "@testing-library/react-native";
import { useEffect } from "react";
import { Share } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import {
  GroupsProvider,
  useGroupsStore,
} from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";
import { GroupOwnerPanel } from "@/features/groups/ui/group-owner-panel";
import { code, fakeGroupsApi, groupId, principal } from "../groups-fixtures";

const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);

/** Test-only helper: the real trigger for `openGroup` is `GroupDetailScreen`'s
 * `useFocusEffect`; `GroupOwnerPanel` on its own assumes a group is already
 * open, so an isolated render needs this to establish that context. */
function OpenGroupOnMount({ id }: Readonly<{ id: string }>) {
  const { actions } = useGroupsStore();
  useEffect(() => {
    void actions.openGroup(id);
  }, [actions, id]);
  return null;
}

describe("T3 group owner panel (invite sheet)", () => {
  async function setup(isPresented = true, api = fakeGroupsApi()) {
    const store = createGroupsStore({ createApi: () => api });
    const onDismiss = jest.fn();
    const screen = await render(
      <AppThemeProvider>
        <GroupsProvider
          origin={principal.origin}
          principal={principal}
          authorizedRequest={authorized}
          createStore={() => store}
        >
          <OpenGroupOnMount id={groupId} />
          <GroupOwnerPanel isPresented={isPresented} onDismiss={onDismiss} />
        </GroupsProvider>
      </AppThemeProvider>,
    );
    return { api, onDismiss, screen, store };
  }

  test("renders no fields or actions when not presented", async () => {
    const { screen } = await setup(false);
    expect(screen.queryByLabelText("만료 시각 (선택, ISO 8601)")).toBeNull();
    expect(screen.queryByRole("button", { name: "초대 코드 발급" })).toBeNull();
  });

  test("shows the expiry and max-uses fields with an issue button gated on validity", async () => {
    const { screen } = await setup();
    expect(screen.getByLabelText("만료 시각 (선택, ISO 8601)")).toBeTruthy();
    expect(screen.getByLabelText("최대 사용 횟수 (선택)")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "초대 코드 발급" }),
    ).toBeEnabled();
    await fireEvent.changeText(
      screen.getByLabelText("최대 사용 횟수 (선택)"),
      "not-a-number",
    );
    expect(
      screen.getByRole("button", { name: "초대 코드 발급" }),
    ).toBeDisabled();
  });

  test("issuing a code reveals a selectable code with share and hide actions", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction" });
    const { screen, store } = await setup();
    await fireEvent.press(
      screen.getByRole("button", { name: "초대 코드 발급" }),
    );
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
});
