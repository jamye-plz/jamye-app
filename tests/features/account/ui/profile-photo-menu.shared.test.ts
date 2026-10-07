import {
  PROFILE_PHOTO_ROW_TITLE,
  RESET_PHOTO_LABEL,
  SELECT_PHOTO_LABEL,
  profilePhotoActions,
} from "@/features/account/ui/profile-photo-menu.shared";

// AV-AC4: menu copy and enablement shared by iOS and Android.
describe("profilePhotoActions", () => {
  const onSelectPhoto = jest.fn();
  const onResetToDefault = jest.fn();

  test("uses the agreed Korean labels", () => {
    expect(PROFILE_PHOTO_ROW_TITLE).toBe("프로필 사진");
    expect(SELECT_PHOTO_LABEL).toBe("사진 선택");
    expect(RESET_PHOTO_LABEL).toBe("기본 이미지로");
  });

  test("lists 사진 선택 then 기본 이미지로 and enables both when idle with an avatar", () => {
    const actions = profilePhotoActions({
      hasAvatar: true,
      busy: false,
      onSelectPhoto,
      onResetToDefault,
    });
    expect(actions.map((action) => [action.key, action.label])).toEqual([
      ["select", "사진 선택"],
      ["reset", "기본 이미지로"],
    ]);
    expect(actions.map((action) => action.disabled)).toEqual([false, false]);
    actions[0]?.onPress();
    actions[1]?.onPress();
    expect(onSelectPhoto).toHaveBeenCalledTimes(1);
    expect(onResetToDefault).toHaveBeenCalledTimes(1);
  });

  test("disables 기본 이미지로 when there is no avatar", () => {
    const actions = profilePhotoActions({
      hasAvatar: false,
      busy: false,
      onSelectPhoto,
      onResetToDefault,
    });
    expect(actions.map((action) => action.disabled)).toEqual([false, true]);
  });

  test("disables every action while an upload or clear is running", () => {
    const actions = profilePhotoActions({
      hasAvatar: true,
      busy: true,
      onSelectPhoto,
      onResetToDefault,
    });
    expect(actions.map((action) => action.disabled)).toEqual([true, true]);
  });
});
