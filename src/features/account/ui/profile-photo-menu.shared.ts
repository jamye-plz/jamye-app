/**
 * AV-AC4: copy and enablement shared by the iOS (SwiftUI `Menu`) and Android
 * (Material 3 `DropdownMenu`) profile-photo menus and the account screens.
 */
export const PROFILE_PHOTO_ROW_TITLE = "프로필 사진";
export const SELECT_PHOTO_LABEL = "사진 선택";
export const RESET_PHOTO_LABEL = "기본 이미지로";
export const PROFILE_PHOTO_FAILURE_TITLE = "프로필 사진";
export const PROFILE_PHOTO_CHANGE_LABEL = "프로필 사진 변경";
export const PROFILE_PHOTO_PROGRESS_LABEL = "프로필 사진 업로드 중";
export const PROFILE_PHOTO_MENU_LABEL = "프로필 사진 메뉴";

export type ProfilePhotoAction = Readonly<{
  key: "select" | "reset";
  label: string;
  disabled: boolean;
  onPress: () => void;
}>;

/**
 * `사진 선택` then `기본 이미지로`. Every action is disabled while a pick,
 * upload or clear is running; `기본 이미지로` is also disabled when the
 * account has no avatar to reset.
 */
export function profilePhotoActions(
  input: Readonly<{
    hasAvatar: boolean;
    busy: boolean;
    onSelectPhoto: () => void;
    onResetToDefault: () => void;
  }>,
): ProfilePhotoAction[] {
  return [
    {
      key: "select",
      label: SELECT_PHOTO_LABEL,
      disabled: input.busy,
      onPress: input.onSelectPhoto,
    },
    {
      key: "reset",
      label: RESET_PHOTO_LABEL,
      disabled: input.busy || !input.hasAvatar,
      onPress: input.onResetToDefault,
    },
  ];
}
