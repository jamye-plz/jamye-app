import { act, fireEvent, render } from "@testing-library/react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";
import { GroupFormScreen } from "@/features/groups/ui/group-form-screen";
import {
  code,
  deferred,
  fakeGroupsApi,
  group,
  principal,
} from "../groups-fixtures";

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockStackScreen = jest.fn(
  (
    _props: Readonly<{
      options: { presentation?: string; title?: string };
    }>,
  ) => null,
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useFocusEffect: (callback: () => () => void) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
  Stack: {
    Screen: (
      props: Readonly<{
        options: { presentation?: string; title?: string };
      }>,
    ) => mockStackScreen(props),
  },
}));

const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);

describe("T3 group form screen", () => {
  beforeEach(() => jest.clearAllMocks());
  async function setup(mode: "create" | "join", api = fakeGroupsApi()) {
    const store = createGroupsStore({ createApi: () => api });
    const screen = await render(
      <AppThemeProvider>
        <GroupsProvider
          origin={principal.origin}
          principal={principal}
          authorizedRequest={authorized}
          createStore={() => store}
        >
          <GroupFormScreen mode={mode} />
        </GroupsProvider>
      </AppThemeProvider>,
    );
    return { api, screen, store };
  }
  function lastStackScreenProps() {
    return mockStackScreen.mock.calls.at(-1)![0];
  }

  test("presents a create modal with the correct title and no back link", async () => {
    const { screen } = await setup("create");
    const props = lastStackScreenProps();
    expect(props.options.title).toBe("새 그룹");
    expect(props.options.presentation).toBe("modal");
    expect(screen.getByLabelText("그룹 이름")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "뒤로" })).toBeNull();
  });

  test("titles the join modal for invite entry and shows its helper copy", async () => {
    const { screen } = await setup("join");
    const props = lastStackScreenProps();
    expect(props.options.title).toBe("초대 코드로 가입");
    expect(props.options.presentation).toBe("modal");
    expect(screen.getByLabelText("초대 코드")).toBeTruthy();
    expect(screen.getByText(/16~64자의 영문, 숫자, 밑줄, 하이픈/)).toBeTruthy();
  });

  test("primary action shows a busy label while the request is pending", async () => {
    const { screen, api } = await setup("create");
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "이름");
    const pending = deferred<typeof group>();
    api.createGroup.mockReturnValueOnce(pending.promise);
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    expect(
      screen.getByRole("button", { name: "만들기 처리 중…" }),
    ).toBeTruthy();
    await act(async () => {
      pending.resolve(group);
    });
  });

  test("primary action disables until the server Retry-After elapses", async () => {
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
    } finally {
      jest.useRealTimers();
    }
  });

  test("an unknown create result reveals a distinct explicit repeat action", async () => {
    const { screen, api } = await setup("create");
    api.createGroup.mockRejectedValueOnce(
      new GroupsApiError(408, "request_timeout"),
    );
    await fireEvent.changeText(screen.getByLabelText("그룹 이름"), "이름");
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    expect(
      screen.getByRole("button", {
        name: "중복 생성 가능성을 이해하고 다시 만들기",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "만들기" })).toBeDisabled();
  });
});
