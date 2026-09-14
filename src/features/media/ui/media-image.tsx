import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";
import { useMediaAccess } from "@/features/media/model/use-media-access";
import {
  useMediaGeneration,
  useMediaRuntime,
} from "@/features/media/model/media-runtime";
import { MAX_IMAGE_BYTES } from "../model/media-policy";
import {
  allocateDownloadDestination,
  removeDownloadedFile,
} from "../platform/media-downloads";
import { downloadToFile } from "../platform/media-object-transfer";
import { MediaImageViewer } from "./media-image-viewer";

type LoadState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; uri: string }>
  | Readonly<{ status: "error" }>;

const IMAGE_SIZE = 160;

/** MD4 canonical image display, keyed by `media.id` (never `media_upload_id`). Expiry
 * and load failures both surface one bounded manual retry — never an automatic loop.
 * Reads the shared `MediaRuntime` (`useMediaAccess`/`useMediaRuntime`) directly rather
 * than taking API functions as props, matching core/model's consumption seam. */
export function MediaImage({
  mediaId,
  filename,
}: Readonly<{
  mediaId: string;
  filename: string | null;
}>) {
  const { colors } = useAppTheme();
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);
  const [attempt, setAttempt] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const viewKey = `${runtime?.accountKey}:${mediaId}:${generation}:${attempt}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    value: LoadState;
  } | null>(null);
  const state: LoadState =
    loaded?.key === viewKey ? loaded.value : { status: "loading" };

  useFocusEffect(
    useCallback(() => {
      if (!access || !runtime || !runtime.isCurrent(generation)) return;
      const controller = new AbortController();
      let ownedUri: string | null = null;
      const current = () =>
        !controller.signal.aborted && runtime.isCurrent(generation);
      const cancel = () => {
        controller.abort();
        setExpandedKey((current) => (current === viewKey ? null : current));
        setLoaded((current) => (current?.key === viewKey ? null : current));
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
              key: viewKey,
              value: { status: "ready", uri: destination.uri },
            });
          else removeDownloadedFile(destination.uri);
        } catch {
          if (ownedUri) removeDownloadedFile(ownedUri);
          if (current())
            setLoaded({ key: viewKey, value: { status: "error" } });
        }
      })();
      return () => {
        unsubscribe();
        cancel();
      };
    }, [access, runtime, mediaId, filename, generation, viewKey]),
  );

  const retry = () => {
    if (attempt >= 1) return;
    setAttempt((value) => value + 1);
  };

  const label = filename ?? "첨부 이미지";

  if (!access || !runtime) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceMuted,
          borderRadius: 12,
          height: IMAGE_SIZE,
          justifyContent: "center",
          width: IMAGE_SIZE,
        }}
      >
        <Text style={{ color: colors.textMuted, textAlign: "center" }}>
          {label}
        </Text>
      </View>
    );
  }
  if (state.status === "loading") {
    return (
      <View
        accessibilityLabel={`${label} 불러오는 중`}
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceMuted,
          borderRadius: 12,
          height: IMAGE_SIZE,
          justifyContent: "center",
          width: IMAGE_SIZE,
        }}
      >
        <Text style={{ color: colors.textMuted }}>이미지 불러오는 중…</Text>
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceMuted,
          borderRadius: 12,
          gap: appSpacing.xxs,
          height: IMAGE_SIZE,
          justifyContent: "center",
          padding: appSpacing.sm,
          width: IMAGE_SIZE,
        }}
      >
        <Text style={{ color: colors.error, textAlign: "center" }}>
          이미지를 불러오지 못했습니다.
        </Text>
        <Pressable
          accessibilityLabel={`${label} 다시 불러오기`}
          accessibilityRole="button"
          accessibilityState={{ disabled: attempt >= 1 }}
          disabled={attempt >= 1}
          onPress={retry}
          style={{
            justifyContent: "center",
            minHeight: appControl.standardHeight,
          }}
        >
          <Text style={{ color: colors.primary }}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  const imageFailed = () => {
    removeDownloadedFile(state.uri);
    setExpandedKey((current) => (current === viewKey ? null : current));
    setLoaded((current) =>
      current?.key === viewKey &&
      current.value.status === "ready" &&
      current.value.uri === state.uri
        ? { key: viewKey, value: { status: "error" } }
        : current,
    );
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 자세히 보기`}
        onPress={() => {
          if (runtime.isCurrent(generation)) setExpandedKey(viewKey);
        }}
      >
        <Image
          accessible
          accessibilityLabel={label}
          accessibilityRole="image"
          onError={imageFailed}
          source={{ uri: state.uri }}
          style={{ borderRadius: 12, height: IMAGE_SIZE, width: IMAGE_SIZE }}
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
