import { act, fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { GroupsProvider } from "@/features/groups/model/groups-provider";
import { createGroupsStore } from "@/features/groups/model/groups-store";
import type { AuthorizedGroupsRequest } from "@/features/groups/model/groups-store";
import type { GroupListScreen as GroupListScreenType } from "@/features/groups/ui/group-list-screen";
import { fakeGroupsApi, principal } from "../groups-fixtures";

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
// `android-extended-fab.android.tsx` has no iOS/default fallback file by
// design (ADR 0010: no FAB on iOS) -- jest always resolves "ios", so this
// screen's own import of it (a bare, unsuffixed specifier) must be
// intercepted here rather than left to platform-extension resolution.
jest.mock("@/shared/ui/android-extended-fab.android", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AndroidExtendedFab: (props: {
      accessibilityLabel?: string;
      items: readonly { key: string; label: string; onPress: () => void }[];
      label: string;
      testID?: string;
    }) => (
      <View testID={props.testID}>
        <Text>{props.label}</Text>
        {props.items.map((item) => (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            key={item.key}
            onPress={item.onPress}
          />
        ))}
      </View>
    ),
  };
});
// `snackbar-host.android.tsx` has no iOS/default fallback file either
// (its Compose SnackbarHost has no swift-ui counterpart) -- same reasoning
// as `android-extended-fab.android` above. `mockShowSnackbar` is captured at
// module scope so tests can drive the imperative `showSnackbar(...)` call
// the screen makes through the forwarded ref.
export const mockShowSnackbar = jest.fn<
  Promise<"actionPerformed" | "dismissed">,
  [{ actionLabel?: string; message: string }]
>();
jest.mock("@/shared/ui/snackbar-host.android", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SNACKBAR_DEFAULT_RETRY_LABEL: "다시 시도",
    AndroidSnackbarHost: React.forwardRef(function AndroidSnackbarHost(
      props: { testID?: string },
      ref: React.Ref<{ showSnackbar: typeof mockShowSnackbar }>,
    ) {
      React.useImperativeHandle(ref, () => ({
        showSnackbar: mockShowSnackbar,
      }));
      return <View testID={props.testID} />;
    }),
  };
});
jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyPressable = Pressable as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  type MockChildren = Readonly<{ children?: ReactNode; testID?: string }>;
  function Alert(
    props: Readonly<{
      children?: ReactNode;
      isPresented?: boolean;
      testID?: string;
      title?: string;
    }>,
  ) {
    if (!props.isPresented) return null;
    return (
      <View testID={props.testID ?? "alert"}>
        <Text accessibilityRole="header">{props.title}</Text>
        {props.children}
      </View>
    );
  }
  const slot = () =>
    function MockSlot({ children }: MockChildren) {
      return <View>{children}</View>;
    };
  Alert.Trigger = slot();
  Alert.Actions = slot();
  Alert.Message = slot();
  function AlertButton(
    props: Readonly<{ label?: string; onPress?: () => void; role?: string }>,
  ) {
    return (
      <AnyPressable
        accessibilityHint={props.role}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        onPress={props.onPress}
      />
    );
  }
  function Spacer() {
    return <View testID="spacer" />;
  }
  function MockText({ children }: MockChildren) {
    return <Text>{children}</Text>;
  }
  function VStack({ children, testID }: MockChildren) {
    return <View testID={testID}>{children}</View>;
  }
  function ProgressView() {
    return <View testID="progress-view" />;
  }
  function ContentUnavailableView(
    props: Readonly<{ description?: string; title?: string }>,
  ) {
    return (
      <View testID="content-unavailable">
        <Text accessibilityRole="header">{props.title}</Text>
        {props.description ? <Text>{props.description}</Text> : null}
      </View>
    );
  }
  return {
    Alert,
    Button: AlertButton,
    ContentUnavailableView,
    ProgressView,
    Spacer,
    Text: MockText,
    VStack,
  };
});

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (callback: () => () => void) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
  Stack: { Screen: () => null },
}));
const authorized: AuthorizedGroupsRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);

function loadAndroid(): typeof GroupListScreenType {
  return jest.requireActual<{ GroupListScreen: typeof GroupListScreenType }>(
    "../../../../src/features/groups/ui/group-list-screen.android.tsx",
  ).GroupListScreen;
}

describe("GroupListScreen (Android): G3 Extended FAB replaces the header +", () => {
  beforeEach(() => jest.clearAllMocks());
  test("the Extended FAB offers 새 그룹 만들기 / 초대 코드로 가입 instead of a header button", async () => {
    const AndroidGroupListScreen = loadAndroid();
    const api = fakeGroupsApi();
    const store = createGroupsStore({ createApi: () => api });
    const screen = await render(
      <AppThemeProvider>
        <GroupsProvider
          origin={principal.origin}
          principal={principal}
          authorizedRequest={authorized}
          createStore={() => store}
        >
          <AndroidGroupListScreen />
        </GroupsProvider>
      </AppThemeProvider>,
    );
    expect(screen.getByTestId("group-list-fab")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "그룹 추가" })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "새 그룹 만들기" }),
    );
    expect(mockPush).toHaveBeenLastCalledWith("/groups/create");
    await fireEvent.press(
      screen.getByRole("button", { name: "초대 코드로 가입" }),
    );
    expect(mockPush).toHaveBeenLastCalledWith("/groups/join");
  });

  test("C1: a refresh error while rows are already showing raises the Snackbar, and its action retries", async () => {
    mockShowSnackbar.mockResolvedValue("actionPerformed");
    const AndroidGroupListScreen = loadAndroid();
    const api = fakeGroupsApi();
    api.listGroups.mockResolvedValueOnce({
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "우리 그룹",
          ownerId: "22222222-2222-4222-8222-222222222222",
          memberCount: 2,
          maxMembers: 10,
          mainChatroomId: "33333333-3333-4333-8333-333333333333",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
      nextCursor: null,
    });
    const store = createGroupsStore({ createApi: () => api });
    await render(
      <AppThemeProvider>
        <GroupsProvider
          origin={principal.origin}
          principal={principal}
          authorizedRequest={authorized}
          createStore={() => store}
        >
          <AndroidGroupListScreen />
        </GroupsProvider>
      </AppThemeProvider>,
    );
    expect(mockShowSnackbar).not.toHaveBeenCalled();
    api.listGroups.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      await store.actions.loadGroups();
    });
    expect(mockShowSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({ actionLabel: "다시 시도" }),
    );
    await Promise.resolve();
    expect(api.listGroups).toHaveBeenCalledTimes(3);
  });
});
