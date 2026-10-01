import { render } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";

const mockUseLocalSearchParams = jest.fn();
jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { View } = require("react-native");
  return {
    useLocalSearchParams: () => mockUseLocalSearchParams(),
    Stack: { Screen: () => <View testID="group-gallery-stack-screen" /> },
  };
});

const mockChatroomMediaGridScreen = jest.fn();
jest.mock("@/features/media/ui/chatroom-media-grid-screen", () => ({
  ChatroomMediaGridScreen: (props: { chatroomId: string }) => {
    mockChatroomMediaGridScreen(props);
    return null;
  },
}));

const mockUseGroupsStore = jest.fn();
jest.mock("@/features/groups/model/groups-provider", () => ({
  useGroupsStore: () => mockUseGroupsStore(),
}));

// The empty state is a SwiftUI/Compose node (needs a `Host`); this route's
// own test only needs to prove it picks the right kind/testID, matching
// `chatroom-media-grid-screen.test.tsx`'s own inline fake for the same
// component (its own render is covered by `standard-state-view.test.tsx`).
jest.mock("@/shared/ui/standard-state-view", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { Text, View } = require("react-native");
  return {
    StandardStateView: (props: {
      kind: string;
      testID?: string;
      title?: string;
    }) => (
      <View testID={props.testID}>
        {props.title ? <Text>{props.title}</Text> : null}
      </View>
    ),
  };
});

// eslint-disable-next-line import/first
import GroupGalleryRoute from "@/app/groups/[groupId]/gallery";

const groupId = "11111111-1111-4111-8111-111111111111";
const mainChatroomId = "33333333-3333-4333-8333-333333333333";

function emptyGroupsState() {
  return {
    state: {
      detail: { id: null, group: null },
      list: { items: [] },
    },
  };
}

describe("E7d/GROUPS-AC5 group gallery route", () => {
  beforeEach(() => {
    mockChatroomMediaGridScreen.mockClear();
    mockUseGroupsStore.mockReset();
    mockUseGroupsStore.mockReturnValue(emptyGroupsState());
  });

  test("passes chatroomId from the query param straight through, without consulting the group cache", async () => {
    mockUseLocalSearchParams.mockReturnValue({
      groupId,
      chatroomId: mainChatroomId,
    });
    await render(
      <AppThemeProvider>
        <GroupGalleryRoute />
      </AppThemeProvider>,
    );
    expect(mockChatroomMediaGridScreen).toHaveBeenCalledWith({
      chatroomId: mainChatroomId,
    });
  });

  test("falls back to the open group detail's mainChatroomId when the param is missing", async () => {
    mockUseLocalSearchParams.mockReturnValue({ groupId });
    mockUseGroupsStore.mockReturnValue({
      state: {
        detail: { id: groupId, group: { id: groupId, mainChatroomId } },
        list: { items: [] },
      },
    });
    await render(
      <AppThemeProvider>
        <GroupGalleryRoute />
      </AppThemeProvider>,
    );
    expect(mockChatroomMediaGridScreen).toHaveBeenCalledWith({
      chatroomId: mainChatroomId,
    });
  });

  test("falls back to the cached group list's mainChatroomId when the param is missing and no detail is open", async () => {
    mockUseLocalSearchParams.mockReturnValue({ groupId });
    mockUseGroupsStore.mockReturnValue({
      state: {
        detail: { id: null, group: null },
        list: { items: [{ id: groupId, mainChatroomId }] },
      },
    });
    await render(
      <AppThemeProvider>
        <GroupGalleryRoute />
      </AppThemeProvider>,
    );
    expect(mockChatroomMediaGridScreen).toHaveBeenCalledWith({
      chatroomId: mainChatroomId,
    });
  });

  test("renders the empty state instead of the grid when no chatroomId can be resolved", async () => {
    mockUseLocalSearchParams.mockReturnValue({ groupId });
    const screen = await render(
      <AppThemeProvider>
        <GroupGalleryRoute />
      </AppThemeProvider>,
    );
    expect(mockChatroomMediaGridScreen).not.toHaveBeenCalled();
    expect(screen.getByTestId("group-gallery-empty")).toBeTruthy();
  });
});
