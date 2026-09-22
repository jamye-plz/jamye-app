import { act, render } from "@testing-library/react-native";
import { AppState, Text } from "react-native";
import {
  GroupsProvider,
  useGroupName,
  useGroupsStore,
} from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type {
  AuthorizedGroupsRequest,
  GroupsStore,
} from "@/features/groups/model/groups-store";
import {
  fakeGroupsApi,
  group,
  groupId,
  otherId,
  principal,
} from "../groups-fixtures";

const authorize: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);

describe("M7 scoped provider", () => {
  test("masks previous account during render, not just after effects, and disposes old store", async () => {
    const stores: GroupsStore[] = [];
    const observations: string[] = [];
    const factory = () => {
      const store = createGroupsStore({ createApi: fakeGroupsApi });
      stores.push(store);
      return store;
    };
    function Probe({ account }: { account: string }) {
      const { state } = useGroupsStore();
      observations.push(`${account}:${state.list.items.length}`);
      return <Text>{state.list.items.length}</Text>;
    }
    const screen = await render(
      <GroupsProvider
        origin={principal.origin}
        principal={principal}
        authorizedRequest={authorize}
        createStore={factory}
      >
        <Probe account="old" />
      </GroupsProvider>,
    );
    await act(() => stores[0].actions.loadGroups());
    expect(screen.getByText("1")).toBeTruthy();
    await screen.rerender(
      <GroupsProvider
        origin={principal.origin}
        principal={{ ...principal, userId: otherId }}
        authorizedRequest={authorize}
        createStore={factory}
      >
        <Probe account="new" />
      </GroupsProvider>,
    );
    expect(observations).not.toContain("new:1");
    expect(stores[0].getState().list.items).toEqual([]);
    expect(stores).toHaveLength(2);
    await screen.unmount();
  });
  test("does not recreate on same identity and only refreshes loaded data on foreground", async () => {
    let listener!: (state: "active" | "background") => void;
    const remove = jest.fn();
    // react-native's jest setup ships AppState.addEventListener as a jest.fn;
    // mockRestore() on it would wipe the default implementation for every
    // later test in this file, so restore the captured implementation instead.
    const appState = jest.spyOn(AppState, "addEventListener");
    const defaultImplementation = appState.getMockImplementation();
    appState.mockImplementation((_event, callback) => {
      listener = callback;
      return { remove };
    });
    const api = fakeGroupsApi();
    const store = createGroupsStore({ createApi: () => api });
    const factory = jest.fn(() => store);
    const screen = await render(
      <GroupsProvider
        origin={principal.origin}
        principal={principal}
        authorizedRequest={authorize}
        createStore={factory}
      >
        <Text>child</Text>
      </GroupsProvider>,
    );
    await act(() => {
      listener("background");
      listener("active");
    });
    expect(api.listGroups).not.toHaveBeenCalled();
    await act(() => store.actions.loadGroups());
    await screen.rerender(
      <GroupsProvider
        origin={principal.origin}
        principal={{ ...principal }}
        authorizedRequest={authorize}
        createStore={factory}
      >
        <Text>child</Text>
      </GroupsProvider>,
    );
    expect(factory).toHaveBeenCalledTimes(1);
    await act(async () => {
      listener("background");
      listener("active");
    });
    expect(api.listGroups).toHaveBeenCalledTimes(2);
    await screen.unmount();
    expect(remove).toHaveBeenCalled();
    if (defaultImplementation)
      appState.mockImplementation(defaultImplementation);
    else appState.mockRestore();
  });
  test("rejects unscoped use", async () => {
    function Outside() {
      useGroupsStore();
      return null;
    }
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(render(<Outside />)).rejects.toThrow("GroupsProvider");
    error.mockRestore();
  });
});

describe("M14 round 1 useGroupName", () => {
  function renderName(store: GroupsStore, id: string) {
    function Probe() {
      const name = useGroupName(id);
      return <Text testID="name">{name ?? "(null)"}</Text>;
    }
    return render(
      <GroupsProvider
        origin={principal.origin}
        principal={principal}
        authorizedRequest={authorize}
        createStore={() => store}
      >
        <Probe />
      </GroupsProvider>,
    );
  }
  test("is null until a query has seen the group", async () => {
    const store = createGroupsStore({ createApi: fakeGroupsApi });
    const screen = await renderName(store, groupId);
    expect(screen.getByTestId("name").props.children).toBe("(null)");
    await screen.unmount();
  });
  test("falls back to the cached list item name", async () => {
    const store = createGroupsStore({ createApi: fakeGroupsApi });
    const screen = await renderName(store, groupId);
    await act(() => store.actions.loadGroups());
    expect(screen.getByTestId("name").props.children).toBe(group.name);
    await screen.unmount();
  });
  test("prefers the open detail over the list and ignores other groups", async () => {
    const api = fakeGroupsApi();
    api.getGroup.mockResolvedValue({ ...group, name: "상세 이름" });
    const store = createGroupsStore({ createApi: () => api });
    const screen = await renderName(store, groupId);
    await act(() => store.actions.loadGroups());
    await act(() => store.actions.openGroup(groupId));
    expect(screen.getByTestId("name").props.children).toBe("상세 이름");
    await screen.rerender(
      <GroupsProvider
        origin={principal.origin}
        principal={principal}
        authorizedRequest={authorize}
        createStore={() => store}
      >
        <OtherProbe />
      </GroupsProvider>,
    );
    expect(screen.getByTestId("other").props.children).toBe("(null)");
    await screen.unmount();
  });
});

function OtherProbe() {
  const name = useGroupName(otherId);
  return <Text testID="other">{name ?? "(null)"}</Text>;
}
