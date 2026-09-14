import { Image, Pressable, Text, View } from "react-native";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";
import { NativeVideoPlayer } from "@/features/media/platform/native-video-player";
import { useMediaVideo } from "./use-media-video";
import { useMediaVideoThumbnail } from "./use-media-video-thumbnail";
import { MediaViewerModal } from "./media-viewer-modal";

export function MediaVideoCard({
  mediaId,
  filename,
  thumbnailEnabled = false,
}: Readonly<{
  mediaId: string;
  filename: string | null;
  thumbnailEnabled?: boolean;
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
        style={{
          backgroundColor: colors.surfaceMuted,
          borderRadius: 12,
          gap: appSpacing.xxs,
          minHeight: 112,
          padding: appSpacing.sm,
          width: 160,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            height: 90,
            width: "100%",
            justifyContent: "center",
            overflow: "hidden",
            borderRadius: 8,
          }}
        >
          {thumbnail.state?.status === "ready" ? (
            <Image
              accessibilityLabel={`${label} 영상 미리보기`}
              source={{ uri: thumbnail.state.uri }}
              onError={thumbnail.imageFailed}
              resizeMode="cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <Text style={{ color: colors.textMuted }}>
              {thumbnail.state?.status === "loading"
                ? "미리보기 준비 중…"
                : "동영상 미리보기"}
            </Text>
          )}
        </View>
        <Text style={{ color: colors.text }}>동영상</Text>
        {filename ? (
          <Text numberOfLines={2} style={{ color: colors.textMuted }}>
            {filename}
          </Text>
        ) : null}
        <Text style={{ color: available ? colors.primary : colors.textMuted }}>
          ▶ 재생
        </Text>
      </Pressable>
      {thumbnail.state?.status === "error" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 미리보기 다시 시도`}
          accessibilityState={{ disabled: !thumbnail.canRetry }}
          disabled={!thumbnail.canRetry}
          onPress={thumbnail.retry}
          style={{
            minHeight: appControl.standardHeight,
            justifyContent: "center",
            backgroundColor: colors.surfaceMuted,
            borderRadius: 8,
            paddingHorizontal: appSpacing.xxs,
          }}
        >
          <Text style={{ color: colors.primary }}>미리보기 다시 시도</Text>
        </Pressable>
      ) : null}
      {state.status !== "idle" ? (
        <MediaViewerModal
          label={label}
          closeLabel="동영상 닫기"
          onClose={close}
        >
          <View style={{ padding: appSpacing.md, flex: 1 }}>
            {state.status === "downloading" ? (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: colors.text }}
              >
                동영상 받는 중…
              </Text>
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
                <Text accessibilityRole="alert" style={{ color: colors.error }}>
                  {state.message}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="동영상 다시 시도"
                  onPress={() => void open()}
                  style={{
                    minHeight: appControl.standardHeight,
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.primary }}>다시 시도</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </MediaViewerModal>
      ) : null}
    </>
  );
}
