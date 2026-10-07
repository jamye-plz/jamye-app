import { fireEvent, render } from "@testing-library/react-native";

import { ProfilePhotoAvatar } from "@/features/account/ui/profile-photo-avatar";

jest.mock("@/shared/ui/avatar", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Avatar: (props: { testID?: string; size: number; uri?: string | null }) => (
      <View
        testID={props.testID}
        {...({ size: props.size, uri: props.uri } as object)}
      />
    ),
  };
});

// AV-AC4: the 72pt header avatar shows an upload indicator, exposes an
// accessible name, and keeps a >= 44pt hit area.
describe("ProfilePhotoAvatar", () => {
  test("renders the shared Avatar at the requested size with an accessible name and no spinner when idle", async () => {
    const screen = await render(
      <ProfilePhotoAvatar
        busy={false}
        name="지민"
        size={72}
        testID="account-avatar"
        uri="https://api.example/api/v1/avatars/a"
      />,
    );
    expect(screen.getByTestId("account-avatar").props.size).toBe(72);
    expect(screen.queryByTestId("profile-photo-progress")).toBeNull();
  });

  // SHIP fix 2: the iOS header avatar is the SwiftUI Menu's label (no onPress),
  // so it must carry the same button role and name as the Android control.
  test("without onPress (iOS Menu label) it is still a button named 프로필 사진 변경", async () => {
    const screen = await render(
      <ProfilePhotoAvatar
        busy={false}
        name="지민"
        size={72}
        testID="account-avatar"
      />,
    );
    expect(
      screen.getByRole("button", { name: "프로필 사진 변경" }),
    ).toBeTruthy();
  });

  test("without onPress while uploading it is a busy button named 프로필 사진 업로드 중", async () => {
    const screen = await render(
      <ProfilePhotoAvatar busy name="지민" size={72} testID="account-avatar" />,
    );
    const button = screen.getByRole("button", {
      name: "프로필 사진 업로드 중",
    });
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true }),
    );
  });

  test("shows a progress indicator and the busy accessibility name while uploading", async () => {
    const screen = await render(
      <ProfilePhotoAvatar busy name="지민" size={72} testID="account-avatar" />,
    );
    expect(screen.getByTestId("profile-photo-progress")).toBeTruthy();
    expect(screen.getByLabelText("프로필 사진 업로드 중")).toBeTruthy();
  });

  test("with onPress it is a button of at least 44pt that opens the menu, and ignores presses while busy", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ProfilePhotoAvatar
        busy={false}
        name="지민"
        onPress={onPress}
        size={72}
        testID="account-avatar"
      />,
    );
    const button = screen.getByRole("button", { name: "프로필 사진 변경" });
    const style = Object.assign(
      {},
      ...[button.props.style].flat(Infinity).filter(Boolean),
    ) as {
      minHeight?: number;
      minWidth?: number;
      width?: number;
      height?: number;
    };
    expect(
      Math.max(style.minHeight ?? 0, style.height ?? 0),
    ).toBeGreaterThanOrEqual(44);
    expect(
      Math.max(style.minWidth ?? 0, style.width ?? 0),
    ).toBeGreaterThanOrEqual(44);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <ProfilePhotoAvatar
        busy
        name="지민"
        onPress={onPress}
        size={72}
        testID="account-avatar"
      />,
    );
    const busyButton = screen.getByRole("button", {
      name: "프로필 사진 업로드 중",
    });
    expect(busyButton.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true, busy: true }),
    );
    await fireEvent.press(busyButton);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
