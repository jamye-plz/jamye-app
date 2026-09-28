import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { appSpacing } from "@/core/theme/tokens";
import {
  clampImageOffset,
  clampImageZoom,
} from "@/features/media/model/media-image-zoom";
import { useMediaSharing } from "@/features/media/model/media-sharing";
import { NativeVideoPlayer } from "@/features/media/platform/native-video-player";
import { AppText } from "@/shared/ui/app-text";
import { HeaderIconButton } from "@/shared/ui/header-icon-button";
import { NativeButton } from "@/shared/ui/native-button";
import { useMediaImageSource } from "./media-image";
import {
  clearMediaViewer,
  closeMediaViewer,
  useMediaViewerParams,
} from "./media-viewer-store";
import type { MessageAttachmentMedia } from "./message-attachments-view";
import { useMediaVideo } from "./use-media-video";

const WHITE = "#FFFFFF";
const DISMISS_DISTANCE_THRESHOLD = 120;
const DISMISS_VELOCITY_THRESHOLD = 800;

function isVideoType(type: string): boolean {
  return type === "video/mp4";
}
function isViewableType(type: string): boolean {
  return type.startsWith("image/") || isVideoType(type);
}

/**
 * Pinch-to-zoom + double-tap, reusing the same clamp math as
 * `MediaImageViewer` (`model/media-image-zoom.ts`). Driven by plain React
 * state with `.runOnJS(true)` gestures rather than Reanimated shared
 * values/`useAnimatedStyle`: this keeps the pager free of a second
 * JS<->UI-thread animation system layered on top of its own drag-to-dismiss
 * state, and a pinch/double-tap-to-zoom interaction is not a per-frame
 * animation loop, so the small perf cost is an acceptable, documented
 * trade under this task's turn budget.
 */
function ViewerImagePage({
  item,
  width,
  height,
}: Readonly<{
  item: MessageAttachmentMedia;
  width: number;
  height: number;
}>) {
  const { state, retry, canRetry } = useMediaImageSource(
    item.id,
    item.filename,
  );
  const label = item.filename?.trim() || "사진";
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // `startScaleRef` snapshots `scale` once per pinch gesture (`.onStart`)
  // and is read on every subsequent `.onUpdate` of that *same* gesture --
  // `event.scale` from `react-native-gesture-handler` is cumulative from
  // gesture start, not incremental, so this is the standard ref pattern for
  // "value at gesture start" (see the eslint override for
  // `src/features/media/ui/{media-viewer-screen,voice-message-bubble}.tsx`
  // in `eslint.config.js` for why `react-hooks/refs` is off here: these
  // gesture callbacks are genuinely deferred, native-event-driven handlers,
  // never invoked synchronously during this component's render, which the
  // rule cannot verify for a non-React gesture library).
  const startScaleRef = useRef(1);
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      startScaleRef.current = scale;
    })
    .onUpdate((event) => {
      const next = clampImageZoom(startScaleRef.current * event.scale);
      setScale(next);
      setOffset((current) => ({
        x: clampImageOffset(current.x, width, next),
        y: clampImageOffset(current.y, height, next),
      }));
    });
  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd((_event, success) => {
      if (!success) return;
      setScale((current) => (current > 1 ? 1 : 2));
      setOffset({ x: 0, y: 0 });
    });

  if (state.status === "loading") {
    return (
      <View style={[styles.page, { width, height }]}>
        <ActivityIndicator color={WHITE} />
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={[styles.page, { width, height, gap: appSpacing.sm }]}>
        <AppText color={WHITE}>사진을 불러오지 못했습니다.</AppText>
        <NativeButton
          disabled={!canRetry}
          label="다시 시도"
          onPress={retry}
          variant="text"
        />
      </View>
    );
  }
  return (
    <View style={{ width, height, overflow: "hidden" }}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, doubleTap)}>
        <Image
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${label} 상세 이미지`}
          cachePolicy="none"
          contentFit="contain"
          source={{ uri: state.uri }}
          style={{
            width,
            height,
            transform: [
              { translateX: offset.x },
              { translateY: offset.y },
              { scale },
            ],
          }}
        />
      </GestureDetector>
    </View>
  );
}

function ViewerVideoPage({
  item,
  width,
  height,
  active,
}: Readonly<{
  item: MessageAttachmentMedia;
  width: number;
  height: number;
  active: boolean;
}>) {
  const { state, open, close, playbackFailed } = useMediaVideo(item.id);
  // `open` only proceeds once `useMediaVideo` has seen the screen focused,
  // and the viewer gains focus after its first render: opening from a plain
  // mount effect was a no-op that never retried, so the page stayed black on
  // device. A focus effect registered after the hook's own runs right after
  // it marks the screen focused (and again on every refocus).
  useFocusEffect(
    useCallback(() => {
      if (active) void open();
    }, [active, open]),
  );
  useEffect(() => {
    if (!active) close();
  }, [active, close]);

  if (!active) return <View style={{ width, height }} />;
  return (
    <View style={[styles.page, { width, height }]}>
      {state.status === "downloading" ? (
        <AppText accessibilityLiveRegion="polite" color={WHITE}>
          동영상 받는 중…
        </AppText>
      ) : null}
      {state.status === "ready" ? (
        // The page centers its status text; the player fills the page
        // instead -- as a centered flex child it had no width and the page
        // stayed black on device.
        <View style={{ height, width }} testID="media-viewer-video-frame">
          <NativeVideoPlayer
            key={state.uri}
            uri={state.uri}
            onError={playbackFailed}
            onClose={close}
            statusColor={WHITE}
          />
        </View>
      ) : null}
      {state.status === "error" ? (
        <>
          <AppText accessibilityRole="alert" color={WHITE}>
            {state.message}
          </AppText>
          <NativeButton
            label="다시 시도"
            onPress={() => void open()}
            variant="text"
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * R3 full-screen viewer: root Stack `fullScreenModal` route
 * (`src/app/media-viewer.tsx`) + a gesture-handler pager. Horizontal paging
 * uses a plain `pagingEnabled` `ScrollView` (native, simple, accessible)
 * rather than a hand-rolled pager; "아래로 밀어 닫기" is a `Gesture.Pan`
 * wrapping the whole screen, axis-locked (`activeOffsetY`/`failOffsetX`) so
 * a mostly-horizontal drag yields to the ScrollView instead of fighting it.
 * Both this gesture and `ViewerImagePage`'s pinch/double-tap run with
 * `.runOnJS(true)` against plain React state (no Reanimated shared values)
 * -- bounded, non-per-frame interactions, not a continuous animation loop.
 */
export function MediaViewerScreen() {
  const params = useMediaViewerParams();
  const { width, height: windowHeight } = useWindowDimensions();
  const attachments = (params?.attachments ?? []).filter((item) =>
    isViewableType(item.type),
  );
  const [index, setIndex] = useState(
    Math.min(
      Math.max(params?.startIndex ?? 0, 0),
      Math.max(attachments.length - 1, 0),
    ),
  );
  const scrollRef = useRef<ScrollView>(null);
  const [dragY, setDragY] = useState(0);
  const { shareAttachment, busy: shareBusy } = useMediaSharing();
  // Pages are exactly as tall as the pager itself (below the header), so the
  // horizontal pager has nothing to scroll vertically.
  const [pagerHeight, setPagerHeight] = useState(0);
  const pageHeight = pagerHeight > 0 ? pagerHeight : windowHeight;
  const closedRef = useRef(false);
  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    closeMediaViewer();
  }, []);

  useEffect(() => {
    if (!params || attachments.length === 0) close();
  }, [params, attachments.length, close]);

  useEffect(() => clearMediaViewer, []);

  useEffect(() => {
    if (attachments.length === 0) return;
    AccessibilityInfo.announceForAccessibility(
      `${index + 1} / ${attachments.length}`,
    );
  }, [index, attachments.length]);

  const dismissPan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY([-14, 14])
    .failOffsetX([-12, 12])
    .onUpdate((event) => {
      setDragY(event.translationY);
    })
    .onEnd((event) => {
      if (
        Math.abs(event.translationY) > DISMISS_DISTANCE_THRESHOLD ||
        Math.abs(event.velocityY) > DISMISS_VELOCITY_THRESHOLD
      ) {
        close();
      } else {
        setDragY(0);
      }
    });

  if (!params || attachments.length === 0) return null;
  const current = attachments[Math.min(index, attachments.length - 1)];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <GestureDetector gesture={dismissPan}>
        <SafeAreaView
          style={[styles.root, { transform: [{ translateY: dragY }] }]}
        >
          <View style={styles.header}>
            <HeaderIconButton
              accessibilityLabel="닫기"
              onPress={close}
              symbol="close"
              tintColor={WHITE}
            />
            <AppText color={WHITE} style={{ flex: 1, textAlign: "center" }}>
              {index + 1} / {attachments.length}
            </AppText>
            <HeaderIconButton
              accessibilityLabel="공유"
              disabled={shareBusy}
              onPress={() =>
                void shareAttachment({
                  id: current.id,
                  filename: current.filename,
                  type: current.type,
                })
              }
              symbol="share"
              tintColor={WHITE}
            />
          </View>
          <ScrollView
            ref={scrollRef}
            contentOffset={{ x: index * width, y: 0 }}
            alwaysBounceVertical={false}
            directionalLockEnabled
            horizontal
            onLayout={(event) =>
              setPagerHeight(event.nativeEvent.layout.height)
            }
            onMomentumScrollEnd={(event) =>
              setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
            }
            pagingEnabled
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            testID="media-viewer-pager"
          >
            {attachments.map((item, itemIndex) =>
              isVideoType(item.type) ? (
                <ViewerVideoPage
                  key={item.id}
                  active={itemIndex === index}
                  height={pageHeight}
                  item={item}
                  width={width}
                />
              ) : (
                <ViewerImagePage
                  key={item.id}
                  height={pageHeight}
                  item={item}
                  width={width}
                />
              ),
            )}
          </ScrollView>
        </SafeAreaView>
      </GestureDetector>
    </View>
  );
}

const styles = {
  root: { backgroundColor: "#000000", flex: 1 },
  header: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: appSpacing.sm,
    paddingHorizontal: appSpacing.md,
  },
  page: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
