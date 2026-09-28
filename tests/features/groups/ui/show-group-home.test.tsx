import { Stack, Tabs, router } from "expo-router";
import { act, renderRouter } from "expo-router/testing-library";

import { showGroupHome } from "@/features/groups/ui/show-group-home";

// The real router runs here (every other suite mocks expo-router). Its
// `query-string` dependency requires the ESM-only `decode-uri-component`,
// which jest leaves untransformed; the built-in decoder covers these paths.
jest.mock("decode-uri-component", () => ({
  __esModule: true,
  default: (value: string) => decodeURIComponent(value),
}));

// The app's route shape (src/app): the root Stack holds the tab bar and the
// root-level form modals; the groups tab owns a Stack of the group list and
// the group homes. Plain `Tabs` stands in for NativeTabs -- the router state
// has the same shape.
const routes = {
  _layout: () => <Stack />,
  "(tabs)/_layout": () => <Tabs />,
  "(tabs)/groups/_layout": () => <Stack />,
  "(tabs)/groups/index": () => null,
  "(tabs)/groups/[groupId]/index": () => null,
  "(tabs)/notifications/index": () => null,
  "groups/create": () => null,
  "groups/join": () => null,
};

type RouteState = Readonly<{
  name: string;
  state?: Readonly<{ routes: readonly RouteState[] }>;
}>;

function child(route: RouteState | undefined, name: string) {
  return route?.state?.routes.find((item) => item.name === name);
}

/** The root Stack's routes (under expo-router's `__root` wrapper), and the
 * groups tab's stack inside the top one. */
function shape(state: Readonly<{ routes: readonly RouteState[] }>) {
  const root = state.routes[0]?.state?.routes ?? [];
  return {
    root: root.map((route) => route.name),
    groups: child(root.at(-1), "groups")?.state?.routes.map(
      (route) => route.name,
    ),
  };
}

// `renderRouter` switches to fake timers.
afterEach(() => jest.useRealTimers());

describe("showGroupHome (device regression: a new/joined group's home had no back button and the group list was unreachable)", () => {
  test("from the list's create form: closes the form and pushes the home onto the same tab bar's groups stack", async () => {
    const rendered = renderRouter(routes, { initialUrl: "/groups" });
    await rendered;
    await act(() => router.push("/groups/create"));

    await act(() => showGroupHome(router, "group-1"));

    expect(shape(rendered.getRouterState()!)).toEqual({
      groups: ["index", "[groupId]/index"],
      root: ["(tabs)"],
    });
    expect(rendered.getPathname()).toBe("/groups/group-1");
  });

  test("from an invite link that opened the join form cold: the new groups stack still has the list beneath the home", async () => {
    const rendered = renderRouter(routes, { initialUrl: "/groups/join" });
    await rendered;
    expect(shape(rendered.getRouterState()!).root).toEqual(["groups/join"]);

    await act(() => showGroupHome(router, "group-1"));

    expect(shape(rendered.getRouterState()!)).toEqual({
      groups: ["index", "[groupId]/index"],
      root: ["(tabs)"],
    });
    expect(rendered.getPathname()).toBe("/groups/group-1");
  });
});
