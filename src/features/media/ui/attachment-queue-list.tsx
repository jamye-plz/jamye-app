import { Image } from "expo-image";
import { AccessibilityInfo, Pressable, ScrollView, View } from "react-native";
import { useEffect, useRef, useState } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appRadii, appSpacing } from "@/core/theme/tokens";
import { createNativeVideoThumbnail } from "@/features/media/platform/native-video-thumbnail";
import { removeStagedFile } from "@/features/media/platform/media-staging";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import type { MediaAttachmentQueueItem } from "./media-attachment-types";

const STATUS_LABELS: Record<MediaAttachmentQueueItem["status"], string> = {
  staged: "대기 중",
  uploading: "업로드 중",
  finalizing: "마무리 중",
  confirmed: "첨부 완료",
  failed: "첨부 실패",
  cancelled: "취소됨",
};

const THUMBNAIL_SIZE = 64;

/** W4: local file thumbnail for images. Videos generate a real first-frame
 * thumbnail (reusing `native-video-thumbnail.ts`, the same pipeline the
 * server-confirmed poster path uses) into a staging-scoped file, with a play
 * badge over it; while pending or on failure it falls back to the play-badge
 * placeholder alone. Audio never reaches this row in practice (the recorder
 * adds it directly while the composer shows the record/preview bar
 * instead), but a fallback glyph is rendered defensively. */
function useVideoDraftThumbnail(
  kind: MediaAttachmentQueueItem["kind"],
  uri: string,
): string | null {
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== "video") return;
    // No synchronous reset here (react-hooks/set-state-in-effect): each
    // draft item is a stably-keyed `DraftCard` (`key={item.localId}`) whose
    // `uri` never actually changes for a given mounted instance, so the
    // initial `useState(null)` above already covers the "nothing generated
    // yet" state without an extra render.
    const controller = new AbortController();
    let cancelled = false;
    let generatedUri: string | null = null;
    void createNativeVideoThumbnail(uri, controller.signal, {
      destination: "staging",
    })
      .then((generated) => {
        generatedUri = generated;
        if (cancelled) {
          // Cleanup already ran (unmount, or the item changed) before this
          // resolved -- nothing will ever display it, so release the file
          // right here instead of routing it through the cleanup closure
          // below (which already ran and cannot see this late value).
          removeStagedFile(generated);
          return;
        }
        setThumbnailUri(generated);
      })
      .catch(() => {
        // Falls back to the play-badge placeholder below; a per-item retry
        // is not worth the complexity for a draft-row preview.
      });
    return () => {
      cancelled = true;
      controller.abort();
      // Covers the opposite ordering: generation already resolved (and is
      // currently displayed) by the time cleanup runs.
      if (generatedUri) removeStagedFile(generatedUri);
    };
  }, [kind, uri]);
  return thumbnailUri;
}

function DraftThumbnail({
  item,
}: Readonly<{ item: MediaAttachmentQueueItem }>) {
  const { colors } = useAppTheme();
  const videoThumbnailUri = useVideoDraftThumbnail(item.kind, item.uri);
  if (item.kind === "image") {
    return (
      <Image
        accessibilityIgnoresInvertColors
        contentFit="cover"
        source={{ uri: item.uri }}
        style={{ flex: 1 }}
      />
    );
  }
  if (item.kind === "video") {
    return (
      <View style={{ flex: 1 }}>
        {videoThumbnailUri ? (
          <Image
            accessibilityIgnoresInvertColors
            contentFit="cover"
            source={{ uri: videoThumbnailUri }}
            style={{ flex: 1 }}
            testID="draft-video-thumbnail-image"
          />
        ) : (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.fill,
              flex: 1,
              justifyContent: "center",
            }}
          />
        )}
        <View
          style={{
            alignItems: "center",
            bottom: 0,
            justifyContent: "center",
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        >
          <AppSymbol
            name="videoPlay"
            size={22}
            tintColor={videoThumbnailUri ? "#FFFFFF" : colors.text}
          />
        </View>
      </View>
    );
  }
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.fill,
        flex: 1,
        justifyContent: "center",
      }}
    >
      <AppSymbol name="audio" size={22} tintColor={colors.text} />
    </View>
  );
}

function DraftCard({
  item,
  onCancel,
  onRetry,
  onRemove,
}: Readonly<{
  item: MediaAttachmentQueueItem;
  onCancel: (localId: string) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
}>) {
  const { colors } = useAppTheme();
  const previousStatusRef = useRef(item.status);
  useEffect(() => {
    if (previousStatusRef.current !== item.status) {
      AccessibilityInfo.announceForAccessibility(
        `${item.filename ?? "첨부 파일"} ${STATUS_LABELS[item.status]}`,
      );
    }
    previousStatusRef.current = item.status;
  }, [item.filename, item.status]);

  const name = item.filename ?? "첨부 파일";
  const failed = item.status === "failed";
  const uploading = item.status === "uploading" || item.status === "finalizing";
  const cancellable =
    item.status === "staged" ||
    item.status === "uploading" ||
    item.status === "finalizing";
  const progressLabel =
    item.status === "uploading" && item.progress > 0
      ? ` ${Math.round(item.progress * 100)}%`
      : "";

  return (
    <View
      accessibilityLabel={`${name} ${STATUS_LABELS[item.status]}${progressLabel}`}
      style={{ gap: appSpacing.xxs, width: THUMBNAIL_SIZE }}
    >
      <View
        style={{
          borderCurve: "continuous",
          borderRadius: appRadii.medium,
          height: THUMBNAIL_SIZE,
          overflow: "hidden",
          width: THUMBNAIL_SIZE,
        }}
      >
        <DraftThumbnail item={item} />
        {uploading ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.35)",
              bottom: 0,
              justifyContent: "center",
              left: 0,
              position: "absolute",
              right: 0,
              top: 0,
            }}
          >
            <AppText color="#FFFFFF" variant="caption">
              {item.progress > 0 ? `${Math.round(item.progress * 100)}%` : "…"}
            </AppText>
          </View>
        ) : null}
        {failed ? (
          <Pressable
            accessibilityLabel={`${name} 다시 시도`}
            accessibilityRole="button"
            onPress={() => onRetry(item.localId)}
            style={{
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.45)",
              bottom: 0,
              justifyContent: "center",
              left: 0,
              position: "absolute",
              right: 0,
              top: 0,
            }}
          >
            <AppSymbol name="refresh" size={20} tintColor="#FFFFFF" />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={`${name} 빼기`}
          accessibilityRole="button"
          // A11YF-AC5: 20pt visual badge + 8pt uniform hitSlop was only
          // 36x36 (below the 44x44 minimum). Grown asymmetrically instead of
          // uniformly to 12+: the badge sits at the card's top-right corner,
          // 2pt from each edge, with only an 8pt gap to the next thumbnail in
          // this horizontal row -- right/top stay small enough to avoid
          // reaching past that gap into the next card's own hit area, and the
          // shortfall is made up on left/bottom, which have nothing beside
          // them but this card's own thumbnail.
          hitSlop={{ top: 12, right: 8, bottom: 12, left: 16 }}
          onPress={() =>
            cancellable ? onCancel(item.localId) : onRemove(item.localId)
          }
          style={{
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.55)",
            borderRadius: appRadii.full,
            height: 20,
            justifyContent: "center",
            position: "absolute",
            right: 2,
            top: 2,
            width: 20,
          }}
        >
          <AppSymbol name="close" size={12} tintColor="#FFFFFF" />
        </Pressable>
      </View>
      {failed && item.errorMessage ? (
        <AppText color={colors.error} numberOfLines={2} variant="caption">
          {item.errorMessage}
        </AppText>
      ) : null}
    </View>
  );
}

/** W4 draft row: horizontal thumbnails above the input, replacing the old
 * filename-card list (M11). One `close` badge per card is the single "빼기"
 * affordance the requirement calls for; it cancels an in-flight upload or
 * removes an already-settled item, whichever applies. */
export function AttachmentQueueList({
  items,
  onCancel,
  onRetry,
  onRemove,
}: Readonly<{
  items: readonly MediaAttachmentQueueItem[];
  onCancel: (localId: string) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
}>) {
  const visible = items.filter((item) => item.status !== "cancelled");
  if (visible.length === 0) return null;
  return (
    <ScrollView
      contentContainerStyle={{ gap: appSpacing.xs }}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {visible.map((item) => (
        <DraftCard
          key={item.localId}
          item={item}
          onCancel={onCancel}
          onRemove={onRemove}
          onRetry={onRetry}
        />
      ))}
    </ScrollView>
  );
}
