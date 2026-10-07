import { ActivityIndicator, Pressable, View } from "react-native";

import { Avatar } from "@/shared/ui/avatar";

import {
  PROFILE_PHOTO_CHANGE_LABEL,
  PROFILE_PHOTO_PROGRESS_LABEL,
} from "./profile-photo-menu.shared";

const MIN_TOUCH_TARGET = 44;
const SCRIM = "rgba(0, 0, 0, 0.4)";

type ProfilePhotoAvatarProps = Readonly<{
  name: string;
  uri?: string | null;
  size: number;
  busy: boolean;
  /** Android header: opens the shared menu. iOS passes none (the SwiftUI
   * `Menu` label is the touch target). */
  onPress?: () => void;
  testID?: string;
}>;

/**
 * AV-AC4: the account header's avatar with an upload indicator. While the
 * upload runs (`busy`) a scrim + spinner overlays the photo and it reads as
 * `프로필 사진 업로드 중`. It is always a button named `프로필 사진 변경`: with
 * `onPress` (Android) a >= 44pt Pressable that ignores presses while busy;
 * without it (iOS) the label of the SwiftUI `Menu`, which owns the touch, so
 * VoiceOver gets the same role and name. Layout is size-based, so it scales
 * with the 72pt header regardless of font scale.
 */
export function ProfilePhotoAvatar({
  name,
  uri,
  size,
  busy,
  onPress,
  testID,
}: ProfilePhotoAvatarProps) {
  const frame = {
    width: size,
    height: size,
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
  } as const;
  const content = (
    <>
      <Avatar name={name} size={size} testID={testID} uri={uri} />
      {busy ? (
        <View
          pointerEvents="none"
          style={{
            alignItems: "center",
            backgroundColor: SCRIM,
            borderRadius: size / 2,
            bottom: 0,
            justifyContent: "center",
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        >
          <ActivityIndicator color="#FFFFFF" testID="profile-photo-progress" />
        </View>
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View
        accessibilityLabel={
          busy ? PROFILE_PHOTO_PROGRESS_LABEL : PROFILE_PHOTO_CHANGE_LABEL
        }
        accessibilityRole="button"
        accessibilityState={{ busy }}
        accessible
        style={frame}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={
        busy ? PROFILE_PHOTO_PROGRESS_LABEL : PROFILE_PHOTO_CHANGE_LABEL
      }
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={frame}
    >
      {content}
    </Pressable>
  );
}
