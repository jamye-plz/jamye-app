import { Host } from "@expo/ui";
import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { profilePhotoActions } from "@/features/account/ui/profile-photo-menu.shared";

// AV-AC4 (Android): an M3 `DropdownMenu` (chat-message-menu.android /
// action-list-item.android pattern) with a >= 44dp trigger that carries an
// accessibility name; the menu is controlled so the header avatar and the
// 프로필 사진 row can open the same menu.
jest.mock("@expo/ui/jetpack-compose", () => {
  const {
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  function DropdownMenu({
    children,
    expanded,
    onDismissRequest,
  }: Readonly<{ children?: ReactNode }> &
    Readonly<{ expanded: boolean; onDismissRequest: () => void }>) {
    return (
      <View testID="dropdown-menu" {...({ expanded } as object)}>
        <Pressable onPress={onDismissRequest} testID="dropdown-dismiss" />
        {children}
      </View>
    );
  }
  function DropdownMenuTrigger({
    children,
  }: Readonly<{ children?: ReactNode }>) {
    return <View>{children}</View>;
  }
  function DropdownMenuItems({ children }: Readonly<{ children?: ReactNode }>) {
    return <View>{children}</View>;
  }
  DropdownMenu.Trigger = DropdownMenuTrigger;
  DropdownMenu.Items = DropdownMenuItems;
  function DropdownMenuItem({
    children,
    enabled,
    onClick,
  }: Readonly<{ children?: ReactNode }> &
    Readonly<{ enabled?: boolean; onClick: () => void }>) {
    return (
      <Pressable
        accessibilityRole="menuitem"
        accessibilityState={{ disabled: enabled === false }}
        onPress={enabled === false ? undefined : onClick}
      >
        {children}
      </Pressable>
    );
  }
  function DropdownMenuItemText({
    children,
  }: Readonly<{ children?: ReactNode }>) {
    return <View>{children}</View>;
  }
  function DropdownMenuItemLeadingIcon({
    children,
  }: Readonly<{ children?: ReactNode }>) {
    return <View>{children}</View>;
  }
  DropdownMenuItem.Text = DropdownMenuItemText;
  DropdownMenuItem.LeadingIcon = DropdownMenuItemLeadingIcon;
  return {
    DropdownMenu,
    DropdownMenuItem,
    Icon: () => null,
    IconButton: ({
      children,
      onClick,
    }: Readonly<{ children?: ReactNode }> &
      Readonly<{ onClick: () => void }>) => (
      <Pressable
        accessibilityLabel="프로필 사진 메뉴"
        accessibilityRole="button"
        onPress={onClick}
      >
        {children}
      </Pressable>
    ),
    Text: ({ children }: Readonly<{ children?: ReactNode }>) => (
      <RNText>{children}</RNText>
    ),
  };
});

function renderMenu(
  props: Readonly<{
    expanded: boolean;
    hasAvatar?: boolean;
    busy?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
    onSelectPhoto?: () => void;
    onResetToDefault?: () => void;
  }>,
) {
  const { ProfilePhotoMenu } = jest.requireActual<
    typeof import("@/features/account/ui/profile-photo-menu.android")
  >("@/features/account/ui/profile-photo-menu.android");
  return render(
    <AppThemeProvider>
      <Host>
        <ProfilePhotoMenu
          actions={profilePhotoActions({
            hasAvatar: props.hasAvatar ?? true,
            busy: props.busy ?? false,
            onSelectPhoto: props.onSelectPhoto ?? jest.fn(),
            onResetToDefault: props.onResetToDefault ?? jest.fn(),
          })}
          expanded={props.expanded}
          onExpandedChange={props.onExpandedChange ?? jest.fn()}
          testID="photo-menu"
        />
      </Host>
    </AppThemeProvider>,
  );
}

describe("ProfilePhotoMenu (Android)", () => {
  test("lists 사진 선택 and 기본 이미지로 and runs the chosen action then closes", async () => {
    const onSelectPhoto = jest.fn();
    const onExpandedChange = jest.fn();
    const screen = await renderMenu({
      expanded: true,
      onExpandedChange,
      onSelectPhoto,
    });
    expect(screen.getByText("사진 선택")).toBeTruthy();
    expect(screen.getByText("기본 이미지로")).toBeTruthy();
    await fireEvent.press(screen.getByText("사진 선택"));
    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(onSelectPhoto).toHaveBeenCalledTimes(1);
  });

  test("disables 기본 이미지로 without an avatar, and never runs it", async () => {
    const onResetToDefault = jest.fn();
    const screen = await renderMenu({
      expanded: true,
      hasAvatar: false,
      onResetToDefault,
    });
    const reset = screen.getByRole("menuitem", { name: "기본 이미지로" });
    expect(reset.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(reset);
    expect(onResetToDefault).not.toHaveBeenCalled();
  });

  test("disables both items while busy", async () => {
    const screen = await renderMenu({ expanded: true, busy: true });
    expect(
      screen.getByRole("menuitem", { name: "사진 선택" }).props
        .accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByRole("menuitem", { name: "기본 이미지로" }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  test("the trigger has an accessibility name and opens the menu", async () => {
    const onExpandedChange = jest.fn();
    const screen = await renderMenu({ expanded: false, onExpandedChange });
    await fireEvent.press(screen.getByLabelText("프로필 사진 메뉴"));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  test("dismissing the menu reports closed", async () => {
    const onExpandedChange = jest.fn();
    const screen = await renderMenu({ expanded: true, onExpandedChange });
    await fireEvent.press(screen.getByTestId("dropdown-dismiss"));
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });
});
