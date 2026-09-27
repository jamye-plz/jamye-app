import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { GroupsApiError } from "@/features/groups/data/groups-api";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";
import { GroupFormScreen } from "@/features/groups/ui/group-form-screen";
import { pendingInviteStore } from "@/features/groups/model/pending-invite-store";
import {
  code,
  deferred,
  fakeGroupsApi,
  group,
  groupId,
  principal,
} from "../groups-fixtures";

// C3: NativeInputSheet renders through @expo/ui/swift-ui (jest always
// resolves "ios"). One inline mock per the shared test rule.
jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function Host(props: Readonly<{ children?: ReactNode; testID?: string }>) {
    return <View testID={props.testID}>{props.children}</View>;
  }
  return { Host };
});
jest.mock("@expo/ui/swift-ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const {
    Text: RNText,
    TextInput,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
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
  function Text({ children }: MockChildren) {
    return <RNText>{children}</RNText>;
  }
  return { Form, Section, Text, TextField, useNativeState };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  disabled: (value: boolean) => ({ $type: "disabled", value }),
}));

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockStackScreen = jest.fn(
  (
    _props: Readonly<{
      options: { presentation?: string; title?: string };
    }>,
  ) => null,
);
jest.mock("expo-router", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function ToolbarButton(
    props: Readonly<{
      accessibilityLabel?: string;
      children?: ReactNode;
      disabled?: boolean;
      onPress?: () => void;
    }>,
  ) {
    return (
      <Pressable
        accessibilityLabel={props.accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(props.disabled) }}
        disabled={props.disabled}
        onPress={props.onPress}
      >
        <Text>{props.children}</Text>
      </Pressable>
    );
  }
  function Toolbar({
    children,
  }: Readonly<{ children?: ReactNode; placement?: string }>) {
    return <View>{children}</View>;
  }
  Toolbar.Button = ToolbarButton;
  return {
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
      Toolbar,
    },
  };
});

const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);

describe("T3/C3 group form screen (kit NativeInputSheet)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pendingInviteStore.clear();
  });
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

  test("presents the create screen with the right title and 취소/만들기 toolbar actions", async () => {
    const { screen } = await setup("create");
    expect(lastStackScreenProps().options.title).toBe("새 그룹");
    expect(screen.getByPlaceholderText("그룹 이름")).toBeTruthy();
    expect(screen.getByRole("button", { name: "만들기" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "취소" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("titles the join screen for invite entry, shows its helper copy and 가입 action", async () => {
    const { screen } = await setup("join");
    expect(lastStackScreenProps().options.title).toBe("초대 코드로 가입");
    expect(screen.getByPlaceholderText("초대 코드")).toBeTruthy();
    expect(screen.getByText(/16~64자의 영문, 숫자, 밑줄, 하이픈/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "가입" })).toBeTruthy();
  });

  test("join prefills the pending-invite code on focus (after reset) but never auto-joins", async () => {
    pendingInviteStore.set(code);
    const { screen, api } = await setup("join");
    expect(pendingInviteStore.peek()).toBeNull();
    // No typing happened; the field's initial value came from consume().
    expect(screen.getByRole("button", { name: "가입" })).toBeEnabled();
    expect(api.joinByInvite).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "가입" }));
    await waitFor(() =>
      expect(api.joinByInvite).toHaveBeenCalledWith(
        "fake",
        code,
        expect.anything(),
      ),
    );
  });

  test("submit is disabled while a request is pending, and re-enabled after it settles", async () => {
    const { screen, api } = await setup("create");
    await fireEvent.changeText(
      screen.getByPlaceholderText("그룹 이름"),
      "이름",
    );
    const pending = deferred<typeof group>();
    api.createGroup.mockReturnValueOnce(pending.promise);
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    expect(screen.getByRole("button", { name: "만들기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    await act(async () => {
      pending.resolve(group);
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/groups/[groupId]",
      params: { groupId },
    });
  });

  test("primary action disables until the server Retry-After elapses", async () => {
    jest.useFakeTimers();
    try {
      const { screen, api } = await setup("join");
      api.joinByInvite.mockRejectedValueOnce(
        new GroupsApiError(429, "rate_limit_exceeded", 2),
      );
      await fireEvent.changeText(
        screen.getByPlaceholderText("초대 코드"),
        code,
      );
      await fireEvent.press(screen.getByRole("button", { name: "가입" }));
      expect(screen.getByRole("button", { name: "가입" })).toBeDisabled();
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.getByRole("button", { name: "가입" })).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("an uncertain create shows the duplicate-risk warning, and pressing 만들기 again explicitly repeats", async () => {
    const { screen, api } = await setup("create");
    api.createGroup.mockRejectedValueOnce(
      new GroupsApiError(408, "request_timeout"),
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("그룹 이름"),
      "이름",
    );
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    expect(screen.getByText(/이미 만들어졌을 수 있습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "만들기" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "만들기" }));
    expect(api.createGroup).toHaveBeenCalledTimes(2);
    expect(api.createGroup.mock.calls[1]![1]).toEqual({ name: "이름" });
  });
});
