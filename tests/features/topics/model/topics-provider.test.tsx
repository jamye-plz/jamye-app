import { act, render } from "@testing-library/react-native";
import { AppState, Text } from "react-native";
import {
  TopicsProvider,
  useTopics,
} from "@/features/topics/model/topics-provider";
import type { AuthorizedTopicsRequest } from "@/features/topics/model/topics-store";
import { authorize, topicsHarness } from "../topics-harness";
import { groupId, otherId } from "../topics-fixtures";

describe("M10 scoped topic provider", () => {
  const previous = AppState.currentState;
  beforeEach(() => {
    AppState.currentState = "active";
  });
  afterEach(() => {
    AppState.currentState = previous;
    jest.restoreAllMocks();
  });
  function fixture() {
    const f = topicsHarness();
    const observations: string[] = [];
    function Probe({ label }: { label: string }) {
      const { state, ready } = useTopics();
      observations.push(`${label}:${state.items.length}:${ready}`);
      return <Text>{`${state.items.length}:${ready}`}</Text>;
    }
    const tree = (
      identity: typeof f.principal | null = f.principal,
      repo: typeof f.repository | null = f.repository,
      authorization = authorize,
      label = "old",
      subscription = f.subscribeSync,
    ) => (
      <TopicsProvider
        principal={identity}
        repository={repo}
        authorize={authorization}
        watchGroup={f.watchGroup}
        subscribeSync={subscription}
        createStore={f.createStore}
      >
        <Probe label={label} />
      </TopicsProvider>
    );
    return { ...f, tree, observations };
  }
  test.each(["user", "epoch", "origin", "logout"])(
    "clears prior state synchronously for %s",
    async (change) => {
      const f = fixture();
      const screen = await render(f.tree());
      await act(() => f.stores[0]!.actions.openGroup(groupId));
      expect(screen.getByText("1:true")).toBeTruthy();
      const next =
        change === "logout"
          ? null
          : {
              ...f.principal,
              ...(change === "user"
                ? { userId: otherId }
                : change === "origin"
                  ? { origin: "https://new.example.com" }
                  : { epoch: 2 }),
            };
      await screen.rerender(
        f.tree(
          next,
          change === "logout" ? null : f.repository,
          authorize,
          "new",
        ),
      );
      expect(f.observations).not.toContain("new:1:true");
      expect(f.stores[0]!.getState().groupId).toBeNull();
      expect(f.unsubscribe).toHaveBeenCalled();
      await screen.unmount();
    },
  );
  test("credential callback refresh retains the current store and uses updated authorization", async () => {
    const f = fixture();
    const screen = await render(f.tree());
    await act(() => f.stores[0]!.actions.openGroup(groupId));
    const calls = jest.fn();
    const next: AuthorizedTopicsRequest = (execute, signal) => {
      calls();
      return authorize(execute, signal);
    };
    await screen.rerender(f.tree({ ...f.principal }, f.repository, next));
    expect(f.createStore).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1:true")).toBeTruthy();
    await act(() => f.stores[0]!.actions.refresh());
    expect(calls).toHaveBeenCalled();
    await screen.unmount();
  });
  test("replacing only the M9 subscription does not dispose the current topic store", async () => {
    const f = fixture();
    const screen = await render(f.tree());
    await act(() => f.stores[0]!.actions.openGroup(groupId));
    const nextSubscription = jest.fn(
      (_listener: (event: "changed" | "connected" | "evicted") => void) =>
        jest.fn(),
    );
    await screen.rerender(
      f.tree(f.principal, f.repository, authorize, "new", nextSubscription),
    );
    expect(f.createStore).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1:true")).toBeTruthy();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
    await act(() => f.stores[0]!.actions.refresh());
    expect(f.api.listTopics).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  test("closed or opening repository cannot expose a ready topic cache", async () => {
    const f = fixture();
    const screen = await render(f.tree(f.principal, null));
    expect(screen.getByText("0:false")).toBeTruthy();
    expect(f.createStore).not.toHaveBeenCalled();
    await screen.rerender(f.tree());
    await act(() => f.stores[0]!.actions.openGroup(groupId));
    await screen.rerender(f.tree(f.principal, null, authorize, "closed"));
    expect(f.observations).not.toContain("closed:1:false");
    await screen.unmount();
  });
  test("lifecycle and M9 activity are detached on unmount", async () => {
    jest.useFakeTimers();
    let change!: (value: "active" | "background") => void;
    const remove = jest.fn();
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        change = listener;
        return { remove };
      });
    const f = fixture();
    const screen = await render(f.tree());
    await act(() => f.stores[0]!.actions.openGroup(groupId));
    await act(async () => {
      f.subscribeSync.mock.calls[0]![0]("changed");
      await jest.advanceTimersByTimeAsync(250);
    });
    expect(f.api.listTopics).toHaveBeenCalledTimes(2);
    await act(() => {
      change("background");
      f.subscribeSync.mock.calls[0]![0]("changed");
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(f.api.listTopics).toHaveBeenCalledTimes(2);
    await screen.unmount();
    expect(remove).toHaveBeenCalled();
    expect(f.unsubscribe).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
