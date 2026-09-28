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
import type { MediaImageCornerStyle } from "./media-image";
import { reportPixelSize, type MediaPixelSize } from "./media-pixel-size";

const PLAY_OVERLAY_BACKGROUND = "rgba(0, 0, 0, 0.45)";
/** Glyphs over the dark overlay stay white in both themes (the dark theme's
 * `onPrimary` is a dark tone and vanished on device). */
const OVERLAY_GLYPH = "#FFFFFF";
/** Visible size of the in-tile preview retry; `hitSlop` extends it to 44. */
const RETRY_SIZE = 32;
const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 90;

export function MediaVideoCard({
  mediaId,
  filename,
  thumbnailEnabled = false,
  posterMediaId = null,
  dimensions,
  cornerStyle,
  bordered = false,
  onPress,
  onLongPress,
  onPixelSize,
}: Readonly<{
  mediaId: string;
  filename: string | null;
  thumbnailEnabled?: boolean;
  /** Server-provided poster image id; when present the thumbnail is a direct
   * JPEG download instead of a locally-extracted video frame. */
  posterMediaId?: string | null;
  /** R3 attachment grid: an explicit thumbnail width/height, taking
   * priority over the default 160x90. */
  dimensions?: Readonly<{ width: number; height: number }>;
  /** R3: overrides the default uniform `appRadii.medium` rounding. */
  cornerStyle?: MediaImageCornerStyle;
  /** R3: 1px low-opacity outline. */
  bordered?: boolean;
  /** R3: when set, tapping calls this instead of opening the built-in
   * download-and-play modal -- the attachment grid opens the full-screen
   * pager (`openMediaViewer`), which plays the video itself. */
  onPress?: () => void;
  /** R3: long-press opens the message's attachment/context menu. */
  onLongPress?: () => void;
  /** R3: the loaded thumbnail's pixel size (the video frame's ratio), so a
   * single attachment without server dimensions can settle on it. */
  onPixelSize?: (size: MediaPixelSize) => void;
}>) {
  const { colors, colorScheme } = useAppTheme();
  const { state, available, open, close, playbackFailed } =
    useMediaVideo(mediaId);
  const label = filename?.trim() || "첨부 동영상";
  const thumbnail = useMediaVideoThumbnail(
    mediaId,
    thumbnailEnabled,
    posterMediaId,
  );
  const width = dimensions?.width ?? DEFAULT_WIDTH;
  const height = dimensions?.height ?? DEFAULT_HEIGHT;
  const radius: MediaImageCornerStyle = cornerStyle ?? {
    borderRadius: appRadii.medium,
  };
  const outlineStyle = bordered
    ? {
        borderWidth: 1,
        borderColor:
          colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
      }
    : null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 재생`}
        accessibilityState={{ disabled: !available }}
        disabled={!available}
        onPress={() => (onPress ? onPress() : void open())}
        onLongPress={onLongPress}
        style={{ width }}
      >
        <View
          style={[
            {
              alignItems: "center",
              backgroundColor: colors.fill,
              borderCurve: "continuous",
              height,
              justifyContent: "center",
              overflow: "hidden",
              width,
            },
            radius,
            outlineStyle,
          ]}
        >
          {thumbnail.state?.status === "ready" ? (
            <Image
              accessibilityLabel={`${label} 영상 미리보기`}
              cachePolicy="memory"
              contentFit="cover"
              onError={thumbnail.imageFailed}
              onLoad={reportPixelSize(onPixelSize)}
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
            <AppSymbol name="play" size={44} tintColor={OVERLAY_GLYPH} />
          </View>
          {/* R3: like a photo, a video tile carries no filename caption, and
              its preview retry stays inside the tile so grid cells keep one
              size; the play action works either way. */}
          {thumbnail.state?.status === "error" ? (
            <Pressable
              accessibilityLabel={`${label} 미리보기 다시 시도`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !thumbnail.canRetry }}
              disabled={!thumbnail.canRetry}
              hitSlop={(44 - RETRY_SIZE) / 2}
              onPress={thumbnail.retry}
              style={{
                alignItems: "center",
                backgroundColor: PLAY_OVERLAY_BACKGROUND,
                borderRadius: RETRY_SIZE / 2,
                bottom: appSpacing.xs,
                height: RETRY_SIZE,
                justifyContent: "center",
                opacity: thumbnail.canRetry ? 1 : 0.5,
                position: "absolute",
                right: appSpacing.xs,
                width: RETRY_SIZE,
              }}
            >
              <AppSymbol name="refresh" size={18} tintColor={OVERLAY_GLYPH} />
            </Pressable>
          ) : null}
        </View>
      </Pressable>
      {!onPress && state.status !== "idle" ? (
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
