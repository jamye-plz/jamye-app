import { Host } from "@expo/ui";
import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";

import { ProfilePhotoMenu } from "@/features/account/ui/profile-photo-menu";
import { profilePhotoActions } from "@/features/account/ui/profile-photo-menu.shared";

// AV-AC4 (iOS): a SwiftUI `Menu` (single tap opens) whose items are native
// `Button`s, mirroring chat-message-menu.ios (Host + native Buttons, no RN
// pressables inside the menu).
const mockMenuCalls: { label: unknown; testID?: string }[] = [];
jest.mock("@expo/ui/swift-ui", () => {
  const {
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Menu: ({
      children,
      label,
      testID,
    }: Readonly<{
      children?: ReactNode;
      label: ReactNode;
      testID?: string;
    }>) => {
      mockMenuCalls.push({ label, testID });
      return (
        <View testID={testID}>
          <View testID={`${testID}-label`}>{label}</View>
          <View testID={`${testID}-items`}>{children}</View>
        </View>
      );
    },
    Button: (
      props: Readonly<{
        label?: string;
        onPress?: () => void;
        modifiers?: unknown[];
        systemImage?: string;
        role?: string;
        testID?: string;
      }>,
    ) => (
      <Pressable
        accessibilityLabel={props.label}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(props.modifiers?.length) }}
        onPress={props.onPress}
        testID={props.testID}
      >
        <RNText>{props.label}</RNText>
        <RNText testID={`${props.testID}-symbol`}>{props.systemImage}</RNText>
      </Pressable>
    ),
  };
});

describe("ProfilePhotoMenu (iOS)", () => {
  const onSelectPhoto = jest.fn();
  const onResetToDefault = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    mockMenuCalls.length = 0;
  });

  function renderMenu(overrides: { hasAvatar?: boolean; busy?: boolean } = {}) {
    return render(
      <Host>
        <ProfilePhotoMenu
          actions={profilePhotoActions({
            hasAvatar: overrides.hasAvatar ?? true,
            busy: overrides.busy ?? false,
            onSelectPhoto,
            onResetToDefault,
          })}
          label={<Text>트리거</Text>}
          testID="photo-menu"
        />
      </Host>,
    );
  }

  test("renders the trigger label and the two native menu items", async () => {
    const screen = await renderMenu();
    expect(screen.getByText("트리거")).toBeTruthy();
    expect(screen.getByLabelText("사진 선택")).toBeTruthy();
    expect(screen.getByLabelText("기본 이미지로")).toBeTruthy();
  });

  test("runs the chosen action", async () => {
    const screen = await renderMenu();
    await fireEvent.press(screen.getByLabelText("사진 선택"));
    expect(onSelectPhoto).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText("기본 이미지로"));
    expect(onResetToDefault).toHaveBeenCalledTimes(1);
  });

  test("marks 기본 이미지로 disabled when there is no avatar and leaves 사진 선택 enabled", async () => {
    const screen = await renderMenu({ hasAvatar: false });
    expect(
      screen.getByLabelText("기본 이미지로").props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByLabelText("사진 선택").props.accessibilityState.disabled,
    ).toBe(false);
  });

  test("disables both items while busy", async () => {
    const screen = await renderMenu({ busy: true });
    expect(
      screen.getByLabelText("사진 선택").props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByLabelText("기본 이미지로").props.accessibilityState.disabled,
    ).toBe(true);
  });

  test("gives the items SF Symbols", async () => {
    const screen = await renderMenu();
    expect(
      screen.getByTestId("photo-menu-action-select-symbol").props.children,
    ).toBeTruthy();
    expect(
      screen.getByTestId("photo-menu-action-reset-symbol").props.children,
    ).toBeTruthy();
  });
});
