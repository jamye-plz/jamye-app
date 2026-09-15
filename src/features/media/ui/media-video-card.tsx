import { Image } from "expo-image";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appRadii, appSpacing } from "@/core/theme/tokens";
import { NativeVideoPlayer } from "@/features/media/platform/native-video-player";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { NativeButton } from "@/shared/ui/native-button";
import { useMediaVideo } from "./use-media-video";
import { useMediaVideoThumbnail } from "./use-media-video-thumbnail";
import { MediaViewerModal } from "./media-viewer-modal";

const PLAY_OVERLAY_BACKGROUND = "rgba(0, 0, 0, 0.45)";

export function MediaVideoCard({
  mediaId,
  filename,
  thumbnailEnabled = false,
  onPrimary = false,
}: Readonly<{
  mediaId: string;
  filename: string | null;
  thumbnailEnabled?: boolean;
  /** Render captions for placement on the Berry (outgoing bubble) surface. */
  onPrimary?: boolean;
}>) {
  const { colors } = useAppTheme();
  const { state, available, open, close, playbackFailed } =
    useMediaVideo(mediaId);
  const label = filename?.trim() || "첨부 동영상";
  const thumbnail = useMediaVideoThumbnail(mediaId, thumbnailEnabled);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 재생`}
        accessibilityState={{ disabled: !available }}
        disabled={!available}
        onPress={() => void open()}
        style={{ gap: appSpacing.xxs, width: 160 }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.fill,
            borderCurve: "continuous",
            borderRadius: appRadii.medium,
            height: 90,
            justifyContent: "center",
            overflow: "hidden",
            width: 160,
          }}
        >
          {thumbnail.state?.status === "ready" ? (
            <Image
              accessibilityLabel={`${label} 영상 미리보기`}
              cachePolicy="memory"
              contentFit="cover"
              onError={thumbnail.imageFailed}
              recyclingKey={mediaId}
              source={{ uri: thumbnail.state.uri }}
              style={{ height: "100%", width: "100%" }}
              transition={150}
            />
          ) : thumbnail.state?.status === "loading" ? (
            <ActivityIndicator
              accessibilityLabel={`${label} 미리보기 준비 중`}
              color={colors.textMuted}
            />
          ) : null}
          <View
            style={{
              alignItems: "center",
              backgroundColor: PLAY_OVERLAY_BACKGROUND,
              borderRadius: 999,
              height: 56,
              justifyContent: "center",
              position: "absolute",
              width: 56,
            }}
          >
            <AppSymbol name="play" size={44} tintColor={colors.onPrimary} />
          </View>
        </View>
        {filename ? (
          <AppText
            color={onPrimary ? colors.onPrimary : colors.textMuted}
            numberOfLines={2}
            variant="caption"
          >
            {filename}
          </AppText>
        ) : null}
      </Pressable>
      {thumbnail.state?.status === "error" ? (
        <NativeButton
          disabled={!thumbnail.canRetry}
          label={`${label} 미리보기 다시 시도`}
          onPress={thumbnail.retry}
          variant="text"
        />
      ) : null}
      {state.status !== "idle" ? (
        <MediaViewerModal
          label={label}
          closeLabel="동영상 닫기"
          onClose={close}
        >
          <View style={{ padding: appSpacing.md, flex: 1 }}>
            {state.status === "downloading" ? (
              <AppText accessibilityLiveRegion="polite" color={colors.text}>
                동영상 받는 중…
              </AppText>
            ) : null}
            {state.status === "ready" ? (
              <NativeVideoPlayer
                key={state.uri}
                uri={state.uri}
                onError={playbackFailed}
                onClose={close}
              />
            ) : null}
            {state.status === "error" ? (
              <>
                <AppText accessibilityRole="alert" color={colors.error}>
                  {state.message}
                </AppText>
                <NativeButton
                  label="동영상 다시 시도"
                  onPress={() => void open()}
                  variant="text"
                />
              </>
            ) : null}
          </View>
        </MediaViewerModal>
      ) : null}
    </>
  );
}
