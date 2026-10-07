import { useMemo } from "react";

import type { AvatarUploadController } from "@/features/account/model/use-avatar-upload";

import {
  profilePhotoActions,
  type ProfilePhotoAction,
} from "./profile-photo-menu.shared";

/**
 * AV-AC4: the one action list that drives both entry points (header avatar
 * and the `프로필 사진` row) on the iOS and Android account screens; every
 * action is disabled while a pick/upload/clear runs. Call it before the
 * screen's early return, like any hook.
 */
export function useProfilePhotoActions(
  avatarUpload: Pick<
    AvatarUploadController,
    "hasAvatar" | "busy" | "selectPhoto" | "resetToDefault"
  >,
): readonly ProfilePhotoAction[] {
  const { hasAvatar, busy, selectPhoto, resetToDefault } = avatarUpload;
  return useMemo(
    () =>
      profilePhotoActions({
        hasAvatar,
        busy,
        onSelectPhoto: () => void selectPhoto(),
        onResetToDefault: () => void resetToDefault(),
      }),
    [hasAvatar, busy, selectPhoto, resetToDefault],
  );
}
