import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Image } from "expo-image";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appRadii, appSpacing } from "@/core/theme/tokens";
import { useMediaAccess } from "@/features/media/model/use-media-access";
import {
  useMediaGeneration,
  useMediaRuntime,
} from "@/features/media/model/media-runtime";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { NativeButton } from "@/shared/ui/native-button";
import { MAX_IMAGE_BYTES } from "../model/media-policy";
import {
  allocateDownloadDestination,
  removeDownloadedFile,
} from "../platform/media-downloads";
import { downloadToFile } from "../platform/media-object-transfer";
import { MediaImageViewer } from "./media-image-viewer";
import { reportPixelSize, type MediaPixelSize } from "./media-pixel-size";

type LoadState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; uri: string }>
  | Readonly<{ status: "error" }>;

const IMAGE_SIZE = 160;

/**
 * MD4 download for one image attachment, keyed by `media.id` (never
 * `media_upload_id`). Extracted out of `MediaImage` so the R3 full-screen
 * viewer (`media-viewer-screen.tsx`) can reuse the exact same
 * access/download/retry state machine for its zoomable detail page instead
 * of duplicating it -- `MediaImage` below is just this hook plus a
 * thumbnail-sized `Pressable`.
 */
export function useMediaImageSource(
  mediaId: string,
  filename: string | null,
): Readonly<{
  state: LoadState;
  sourceKey: string;
  retry: () => void;
  /** Whether `retry()` still has an attempt left (one manual retry total). */
  canRetry: boolean;
  /** Marks the current (already-"ready") source as failed -- e.g. the
   * downloaded file turned out to be a corrupt/undecodable image -- without
   * consuming the one allowed manual `retry()` attempt. */
  markError: () => void;
}> {
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);
  const [attempt, setAttempt] = useState(0);
  const sourceKey = `${runtime?.accountKey}:${mediaId}:${generation}:${attempt}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    value: LoadState;
  } | null>(null);
  const state: LoadState =
    loaded?.key === sourceKey ? loaded.value : { status: "loading" };

  useFocusEffect(
    useCallback(() => {
      if (!access || !runtime || !runtime.isCurrent(generation)) return;
      const controller = new AbortController();
      let ownedUri: string | null = null;
      const current = () =>
        !controller.signal.aborted && runtime.isCurrent(generation);
      const cancel = () => {
        controller.abort();
        setLoaded((value) => (value?.key === sourceKey ? null : value));
        if (ownedUri) removeDownloadedFile(ownedUri);
      };
      const unsubscribe = runtime.subscribeInvalidation(cancel);
      void (async () => {
        try {
          const result = await access.getAccessUrl(mediaId, controller.signal);
          if (!current()) return;
          const destination = allocateDownloadDestination({
            mediaId,
            filename,
          });
          ownedUri = destination.uri;
          await downloadToFile({
            url: result.url,
            destination,
            maxBytes: MAX_IMAGE_BYTES,
            expectedBytes: result.byteSize,
            signal: controller.signal,
          });
          if (current())
            setLoaded({
              key: sourceKey,
              value: { status: "ready", uri: destination.uri },
            });
          else removeDownloadedFile(destination.uri);
        } catch {
          if (ownedUri) removeDownloadedFile(ownedUri);
          if (current())
            setLoaded({ key: sourceKey, value: { status: "error" } });
        }
      })();
      return () => {
        unsubscribe();
        cancel();
      };
    }, [access, runtime, mediaId, filename, generation, sourceKey]),
  );

  const retry = () => {
    if (attempt >= 1) return;
    setAttempt((value) => value + 1);
  };

  const markError = useCallback(() => {
    setLoaded((current) =>
      current?.key === sourceKey && current.value.status === "ready"
        ? { key: sourceKey, value: { status: "error" } }
        : current,
    );
  }, [sourceKey]);

  return { state, sourceKey, retry, canRetry: attempt < 1, markError };
}

export type MediaImageCornerStyle = Readonly<{
  borderRadius: number;
  borderBottomLeftRadius?: number;
  borderBottomRightRadius?: number;
}>;

/** Reads the shared `MediaRuntime` (`useMediaAccess`/`useMediaRuntime`) directly rather
 * than taking API functions as props, matching core/model's consumption seam. */
export function MediaImage({
  mediaId,
  filename,
  size = IMAGE_SIZE,
  fill = false,
  dimensions,
  cornerStyle,
  bordered = false,
  onPress,
  onLongPress,
  onPixelSize,
  label: labelOverride,
}: Readonly<{
  mediaId: string;
  filename: string | null;
  /** @default IMAGE_SIZE (160) -- the chat-bubble size. Gallery call sites
   * (D4/E10) pass a carousel/grid-specific size instead. */
  size?: number;
  /** Take the container's size instead of a `size` square (the Android
   * gallery carousel, whose items change width as they scroll). */
  fill?: boolean;
  /** R3 attachment grid: an explicit width/height box (original aspect
   * ratio or a grid cell), taking priority over `size`/`fill`. */
  dimensions?: Readonly<{ width: number; height: number }>;
  /** R3: overrides the default uniform `appRadii.medium` rounding -- the
   * single-attachment case passes the message bubble's own directional
   * corners so the shape reads as concentric with it. */
  cornerStyle?: MediaImageCornerStyle;
  /** R3: 1px low-opacity outline (make-interfaces-feel-better), themed
   * black 10%/white 10% for light/dark. */
  bordered?: boolean;
  /** R3: when set, tapping calls this instead of opening the built-in
   * `MediaImageViewer` modal -- the attachment grid opens the full-screen
   * pager (`openMediaViewer`) instead. */
  onPress?: () => void;
  /** R3: long-press opens the message's attachment/context menu
   * (chat-list-owned). */
  onLongPress?: () => void;
  /** R3: the loaded image's pixel size, so a single attachment without
   * server dimensions can settle on its original ratio. */
  onPixelSize?: (size: MediaPixelSize) => void;
  /** @default filename ?? "첨부 이미지". Gallery call sites pass "사진" so the
   * accessibility label doesn't depend on whether the message set a filename. */
  label?: string;
}>) {
  const { colors, colorScheme } = useAppTheme();
  const {
    state,
    sourceKey: viewKey,
    retry,
    canRetry,
    markError,
  } = useMediaImageSource(mediaId, filename);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);

  const label = labelOverride ?? filename ?? "첨부 이미지";
  const box: Readonly<{
    height: number | `${number}%`;
    width: number | `${number}%`;
  }> = dimensions
    ? { height: dimensions.height, width: dimensions.width }
    : fill
      ? { height: "100%", width: "100%" }
      : { height: size, width: size };
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
  const placeholderStyle = {
    alignItems: "center" as const,
    backgroundColor: colors.surfaceMuted,
    borderCurve: "continuous" as const,
    justifyContent: "center" as const,
    ...radius,
    ...box,
  };

  if (!access || !runtime) {
    return (
      <View style={placeholderStyle}>
        <AppText color={colors.textMuted} style={{ textAlign: "center" }}>
          {label}
        </AppText>
      </View>
    );
  }
  if (state.status === "loading") {
    return (
      <View
        accessibilityLabel={`${label} 불러오는 중`}
        style={[placeholderStyle, { backgroundColor: colors.fill }]}
      >
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View
        style={[
          placeholderStyle,
          { gap: appSpacing.xxs, padding: appSpacing.sm },
        ]}
      >
        <AppSymbol name="error" tintColor={colors.error} />
        <AppText
          color={colors.error}
          style={{ textAlign: "center" }}
          variant="caption"
        >
          이미지를 불러오지 못했습니다.
        </AppText>
        <View
          accessible
          accessibilityLabel={`${label} 다시 불러오기`}
          accessibilityState={{ disabled: !canRetry }}
        >
          <NativeButton
            disabled={!canRetry}
            label="다시 시도"
            onPress={retry}
            variant="text"
          />
        </View>
      </View>
    );
  }
  const imageFailed = () => {
    if (state.status === "ready") removeDownloadedFile(state.uri);
    setExpandedKey((current) => (current === viewKey ? null : current));
    markError();
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 자세히 보기`}
        onPress={() => {
          if (!runtime.isCurrent(generation)) return;
          if (onPress) onPress();
          else setExpandedKey(viewKey);
        }}
        onLongPress={onLongPress}
        style={fill && !dimensions ? box : undefined}
      >
        <Image
          accessible
          accessibilityLabel={label}
          accessibilityRole="image"
          cachePolicy="memory"
          contentFit="cover"
          onError={imageFailed}
          onLoad={reportPixelSize(onPixelSize)}
          recyclingKey={viewKey}
          source={{ uri: state.uri }}
          style={{
            ...radius,
            ...box,
            ...(outlineStyle ?? {}),
          }}
          transition={150}
        />
      </Pressable>
      {expandedKey === viewKey && runtime.isCurrent(generation) ? (
        <MediaImageViewer
          key={viewKey}
          uri={state.uri}
          label={label}
          onClose={() =>
            setExpandedKey((current) => (current === viewKey ? null : current))
          }
          onError={imageFailed}
        />
      ) : null}
    </>
  );
}
