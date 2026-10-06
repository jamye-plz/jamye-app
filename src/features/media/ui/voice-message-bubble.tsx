import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatMessage, appControl, appSpacing } from "@/core/theme/tokens";
import { registerActivePlayback } from "@/features/media/model/audio-playback-coordinator";
import { MAX_AUDIO_BYTES } from "@/features/media/model/media-policy";
import { useMediaAccess } from "@/features/media/model/use-media-access";
import {
  useMediaGeneration,
  useMediaRuntime,
} from "@/features/media/model/media-runtime";
import {
  allocateDownloadDestination,
  removeDownloadedFile,
} from "@/features/media/platform/media-downloads";
import { downloadToFile } from "@/features/media/platform/media-object-transfer";
import { useVoicePlaybackSession } from "@/features/media/platform/player";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { NativeButton } from "@/shared/ui/native-button";

type SourceState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; uri: string }>
  | Readonly<{ status: "error" }>;

const THUMB_SIZE = 14;
/** A11YF-AC4: VoiceOver/TalkBack increment/decrement step on the seek bar. */
const SEEK_STEP_SECONDS = 5;
/** A11YF-AC4: the visual track stays `THUMB_SIZE` tall; this expands only
 * the *touchable* bounds (top/bottom) to the 44pt minimum without changing
 * layout -- a vertical-only hitSlop can't newly overlap the play/share
 * buttons beside it (unaffected, already 44pt+) or the non-interactive
 * duration label below it in any interactive-hit-area sense. Applied to both
 * the `View`'s own `hitSlop` prop (standard RN touch/accessibility hit
 * testing) and `seekPan`'s `.hitSlop(...)` (RNGH's own gesture recognition,
 * which the View prop alone may not widen on Android). */
const SEEK_BAR_HIT_SLOP = { top: 15, bottom: 15, left: 0, right: 0 } as const;
const BUBBLE_MAX_WIDTH = 240;
/** The bubble shrinks to its content, so every part has a definite width and
 * the track takes what the max leaves after padding, the play and share
 * buttons, and the two gaps. (A `flex: 1` middle column had no width to grow
 * into, so on device the track spilled out and the time wrapped per glyph.) */
const TRACK_WIDTH =
  BUBBLE_MAX_WIDTH -
  2 * appSpacing.sm -
  2 * appControl.standardHeight -
  2 * appSpacing.xs;

function formatSeconds(totalSeconds: number): string {
  const safe =
    Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * V2 voice message bubble. Unlike photos/videos (R3: no colored bubble),
 * voice keeps the ordinary message-bubble treatment for both directions
 * ("내 음성/상대 음성 모두 같은 말풍선(색은 기존 말풍선 규칙)"): mine ->
 * `colors.primary`, theirs -> `colors.surface`, same radius as
 * `chat-message-row.tsx`'s text bubble.
 *
 * The progress bar is a plain gesture-handler `Pan` (`runOnJS(true)`) driving
 * regular React state rather than a native Host `Slider` or a
 * Reanimated-worklet-driven bar: this bubble can appear many times in a
 * virtualized message list, and the R2 menu decision already flagged
 * per-row native Host cost as a real concern (`alternatives_considered`) --
 * a plain RN view re-rendered at the audio status-update cadence (not per
 * animation frame) avoids adding that cost here too.
 */
export function VoiceMessageBubble({
  mediaId,
  filename,
  duration,
  mine,
  onLongPress,
  onShare,
}: Readonly<{
  mediaId: string;
  filename: string | null;
  /** Server-authoritative duration in seconds (`ConfirmedUpload`/
   * `MediaAccessUrl.duration`); null only for an optimistic row still
   * uploading. */
  duration: number | null;
  mine: boolean;
  onLongPress?: () => void;
  /** No full-screen viewer exists for audio, so this bubble renders its own
   * inline share affordance calling straight through to it. */
  onShare?: () => void;
}>) {
  const { colors } = useAppTheme();
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);
  const [attempt, setAttempt] = useState(0);
  const sourceKey = `${runtime?.accountKey}:${mediaId}:${generation}:${attempt}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    value: SourceState;
  } | null>(null);
  const source: SourceState =
    loaded?.key === sourceKey ? loaded.value : { status: "loading" };
  const label = filename?.trim() || "음성 메시지";

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
            maxBytes: MAX_AUDIO_BYTES,
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

  const session = useVoicePlaybackSession(
    source.status === "ready" ? source.uri : null,
  );
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session.playing) return undefined;
    return registerActivePlayback(mediaId, () => sessionRef.current.pause());
  }, [session.playing, mediaId]);

  // Leaving the screen must not leave audio playing behind.
  useFocusEffect(
    useCallback(() => {
      return () => sessionRef.current.pause();
    }, []),
  );

  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const totalSeconds = duration ?? session.duration;
  const playbackProgress =
    totalSeconds > 0
      ? Math.min(1, Math.max(0, session.currentTime / totalSeconds))
      : 0;
  const progress = dragProgress ?? playbackProgress;
  const elapsedSeconds =
    dragProgress !== null ? dragProgress * totalSeconds : session.currentTime;
  const displaySeconds =
    session.playing || dragProgress !== null || session.currentTime > 0
      ? elapsedSeconds
      : totalSeconds;

  // `seekPan` is rebuilt fresh every render (no memoization), so `session`
  // is always the current one at the moment a gesture actually ends --
  // `.onEnd` fires once, after the user has already lifted their finger,
  // never synchronously during this render, so closing over `session`
  // directly (not through a ref) is both simpler and correct here.
  const seekPan = Gesture.Pan()
    .runOnJS(true)
    // A11YF-AC4: the View's `hitSlop` prop below may not widen RNGH's own
    // gesture-recognition area on Android, so the gesture itself also gets
    // the same hit-test expansion (`Gesture.Pan().hitSlop(...)`,
    // `node_modules/react-native-gesture-handler/lib/typescript/handlers/
    // gestures/gesture.d.ts`).
    .hitSlop(SEEK_BAR_HIT_SLOP)
    .onUpdate((event) => {
      setDragProgress(Math.min(1, Math.max(0, event.x / TRACK_WIDTH)));
    })
    .onEnd((event) => {
      const next = Math.min(1, Math.max(0, event.x / TRACK_WIDTH));
      setDragProgress(null);
      if (totalSeconds > 0) void session.seekTo(next * totalSeconds);
    });

  // A11YF-AC4: a screen-reader user can't perform `seekPan`'s drag gesture,
  // so the `adjustable` role needs its own increment/decrement handler,
  // stepping by a fixed number of seconds instead.
  function handleSeekAccessibilityAction(
    event: Readonly<{ nativeEvent: Readonly<{ actionName: string }> }>,
  ): void {
    if (totalSeconds <= 0) return;
    if (event.nativeEvent.actionName === "increment") {
      void session.seekTo(
        Math.min(totalSeconds, elapsedSeconds + SEEK_STEP_SECONDS),
      );
    } else if (event.nativeEvent.actionName === "decrement") {
      void session.seekTo(Math.max(0, elapsedSeconds - SEEK_STEP_SECONDS));
    }
  }

  const foreground = mine ? colors.onPrimary : colors.text;
  const muted = mine ? colors.onPrimary : colors.textMuted;
  const trackColor = mine ? "rgba(255,255,255,0.35)" : colors.fill;
  const busy = source.status === "loading";
  const canPlay = source.status === "ready" && session.isLoaded;

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: mine ? colors.primary : colors.surface,
        borderBottomLeftRadius: mine
          ? appChatMessage.bubbleRadius
          : appChatMessage.directionalRadius,
        borderBottomRightRadius: mine
          ? appChatMessage.directionalRadius
          : appChatMessage.bubbleRadius,
        borderCurve: "continuous",
        borderRadius: appChatMessage.bubbleRadius,
        flexDirection: "row",
        gap: appSpacing.xs,
        maxWidth: BUBBLE_MAX_WIDTH,
        paddingHorizontal: appSpacing.sm,
        paddingVertical: appSpacing.sm,
      }}
    >
      <Pressable
        accessibilityLabel={
          session.playing ? `${label} 일시정지` : `${label} 재생`
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: !canPlay, busy }}
        disabled={!canPlay}
        onLongPress={onLongPress}
        onPress={() => (session.playing ? session.pause() : session.play())}
        style={{
          alignItems: "center",
          justifyContent: "center",
          minHeight: appControl.standardHeight,
          minWidth: appControl.standardHeight,
        }}
      >
        {busy ? (
          <ActivityIndicator color={foreground} />
        ) : (
          <AppSymbol
            name={session.playing ? "pause" : "play"}
            size={32}
            tintColor={canPlay ? foreground : muted}
          />
        )}
      </Pressable>
      {source.status === "error" ? (
        <View
          style={{ alignItems: "flex-start", gap: appSpacing.xxs, flex: 1 }}
        >
          <AppText color={muted} variant="caption">
            음성을 불러오지 못했습니다.
          </AppText>
          <NativeButton
            disabled={attempt >= 1}
            label="다시 시도"
            onPress={retry}
            variant="text"
          />
        </View>
      ) : (
        <View
          style={{ gap: appSpacing.xxs, width: TRACK_WIDTH }}
          testID="voice-track-column"
        >
          <GestureDetector gesture={seekPan}>
            <View
              accessibilityRole="adjustable"
              accessibilityLabel={`${label} 재생 위치`}
              accessibilityActions={[
                {
                  name: "increment",
                  label: `${SEEK_STEP_SECONDS}초 앞으로`,
                },
                { name: "decrement", label: `${SEEK_STEP_SECONDS}초 뒤로` },
              ]}
              onAccessibilityAction={handleSeekAccessibilityAction}
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(progress * 100),
              }}
              hitSlop={SEEK_BAR_HIT_SLOP}
              style={{
                backgroundColor: trackColor,
                borderRadius: 999,
                height: THUMB_SIZE,
                justifyContent: "center",
                width: TRACK_WIDTH,
              }}
            >
              <View
                style={{
                  backgroundColor: foreground,
                  borderRadius: 999,
                  height: 4,
                  width: Math.max(4, progress * TRACK_WIDTH),
                }}
              />
              <View
                style={{
                  backgroundColor: foreground,
                  borderRadius: THUMB_SIZE / 2,
                  height: THUMB_SIZE,
                  left: Math.max(
                    0,
                    Math.min(
                      TRACK_WIDTH - THUMB_SIZE,
                      progress * TRACK_WIDTH - THUMB_SIZE / 2,
                    ),
                  ),
                  position: "absolute",
                  width: THUMB_SIZE,
                }}
              />
            </View>
          </GestureDetector>
          <AppText
            accessibilityLiveRegion={session.playing ? "polite" : "none"}
            color={muted}
            style={{ fontVariant: ["tabular-nums"] }}
            variant="caption"
          >
            {formatSeconds(displaySeconds)}
          </AppText>
        </View>
      )}
      {onShare ? (
        <Pressable
          accessibilityLabel={`${label} 공유`}
          accessibilityRole="button"
          onPress={onShare}
          style={{
            alignItems: "center",
            justifyContent: "center",
            minHeight: appControl.standardHeight,
            minWidth: appControl.standardHeight,
          }}
        >
          <AppSymbol name="share" size={20} tintColor={muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
