import { Image } from "expo-image";
import { ActivityIndicator, Pressable, View } from "react-native";

import type { ChatroomMediaItem } from "@/core/contracts/server/media";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appRadii } from "@/core/theme/tokens";
import { NativeVideoPlayer } from "@/features/media/platform/native-video-player";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { NativeButton } from "@/shared/ui/native-button";

import { MediaImage } from "./media-image";
import { MediaViewerModal } from "./media-viewer-modal";
import { useMediaVideo } from "./use-media-video";
import { useMediaVideoThumbnail } from "./use-media-video-thumbnail";

const PLAY_OVERLAY_BACKGROUND = "rgba(0, 0, 0, 0.45)";

function formatVideoLabel(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0)
    return "동영상";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `동영상 ${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * D4/E10 gallery thumbnail for one C5 `ChatroomMediaItem`, square at `size`.
 * Images delegate straight to `MediaImage` (same MD4-access-url ->
 * local-file path, reusing its own tap-to-`MediaImageViewer`). Videos render
 * a poster/frame thumbnail with a `videoPlay` badge and reuse the same
 * `useMediaVideo` + `MediaViewerModal` + `NativeVideoPlayer` path
 * `MediaVideoCard` uses for chat bubbles -- just square-sized here instead of
 * `MediaVideoCard`'s fixed 160x90 chat-bubble card, so this is a sibling
 * consumer of those hooks rather than a wrapper around that card.
 */
export function ChatroomMediaThumbnail({
  fill = false,
  item,
  size,
}: Readonly<{
  /** Fill the container (Android carousel items) instead of a `size` square. */
  fill?: boolean;
  item: ChatroomMediaItem;
  size: number;
}>) {
  if (!item.contentType.startsWith("video/")) {
    return (
      <MediaImage
        fill={fill}
        filename={item.filename}
        label="사진"
        mediaId={item.id}
        size={size}
      />
    );
  }
  return <ChatroomVideoThumbnail fill={fill} item={item} size={size} />;
}

function ChatroomVideoThumbnail({
  fill,
  item,
  size,
}: Readonly<{
  fill: boolean;
  item: ChatroomMediaItem;
  size: number;
}>) {
  const { colors } = useAppTheme();
  const { state, available, open, close, playbackFailed } = useMediaVideo(
    item.id,
  );
  const thumbnail = useMediaVideoThumbnail(item.id, true, item.posterMediaId);
  const label = formatVideoLabel(item.duration);
  const badgeSize = Math.round(size * 0.36);
  const box = fill
    ? { height: "100%" as const, width: "100%" as const }
    : { height: size, width: size };
  return (
    <>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled: !available }}
        disabled={!available}
        onPress={() => void open()}
        style={box}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.fill,
            borderCurve: "continuous",
            borderRadius: appRadii.medium,
            justifyContent: "center",
            overflow: "hidden",
            ...box,
          }}
        >
          {thumbnail.state?.status === "ready" ? (
            <Image
              accessible={false}
              cachePolicy="memory"
              contentFit="cover"
              onError={thumbnail.imageFailed}
              recyclingKey={item.id}
              source={{ uri: thumbnail.state.uri }}
              style={{ height: "100%", width: "100%" }}
              transition={150}
            />
          ) : thumbnail.state?.status === "loading" ? (
            <ActivityIndicator color={colors.textMuted} />
          ) : null}
          <View
            style={{
              alignItems: "center",
              backgroundColor: PLAY_OVERLAY_BACKGROUND,
              borderRadius: 999,
              height: badgeSize,
              justifyContent: "center",
              position: "absolute",
              width: badgeSize,
            }}
          >
            <AppSymbol
              name="videoPlay"
              size={Math.round(size * 0.22)}
              tintColor="#FFFFFF"
            />
          </View>
        </View>
      </Pressable>
      {state.status !== "idle" ? (
        <MediaViewerModal
          closeLabel="동영상 닫기"
          label="동영상"
          onClose={close}
        >
          <View style={{ flex: 1, padding: 16 }}>
            {state.status === "downloading" ? (
              <AppText accessibilityLiveRegion="polite" color={colors.text}>
                동영상 받는 중…
              </AppText>
            ) : null}
            {state.status === "ready" ? (
              <NativeVideoPlayer
                key={state.uri}
                onClose={close}
                onError={playbackFailed}
                uri={state.uri}
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
