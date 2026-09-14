import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { requireOptionalNativeModule } from "expo";
import type { VideoPlayer } from "expo-video";
import { useAppTheme } from "@/core/theme/theme-provider";
import { isOwnedDownloadFile, retainDownloadedFile } from "./media-downloads";

type VideoApi = typeof import("expo-video");
type Session = { uri: string; api: VideoApi; player: VideoPlayer };

/** One guarded public SDK entry point shared by playback and frame extraction. */
export function loadNativeVideoApi(): VideoApi | null {
  if (!requireOptionalNativeModule("ExpoVideo")) return null;
  return require("expo-video") as VideoApi;
}

/** AVPlayer/ExoPlayer with system controls, restricted to a downloaded local MP4. */
export function NativeVideoPlayer({
  uri,
  onError,
  onClose,
}: Readonly<{
  uri: string;
  onError: (reason: "unavailable" | "playback") => void;
  onClose: () => void;
}>) {
  const { colors } = useAppTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    let player: VideoPlayer | null = null;
    let releaseFile: (() => void) | undefined;
    let statusSubscription: { remove: () => void } | undefined;
    let appSubscription: { remove: () => void } | undefined;
    const fail = () => {
      if (alive) {
        alive = false;
        onError("playback");
      }
    };
    const dispose = () => {
      alive = false;
      // A torn-down native object must not prevent the remaining cleanup.
      for (const cleanup of [
        () => statusSubscription?.remove(),
        () => appSubscription?.remove(),
        () => player?.pause(),
        () => player?.release(),
        () => releaseFile?.(),
      ]) {
        try {
          cleanup();
        } catch {
          // Never surface native paths/errors while closing a private video.
        }
      }
    };
    const prepare = async () => {
      if (!uri.startsWith("file://") || !isOwnedDownloadFile(uri)) {
        onError("playback");
        return;
      }
      const api = loadNativeVideoApi();
      if (!api) {
        onError("unavailable");
        return;
      }
      // Lazy import keeps existing development binaries usable until a rebuild.
      // Use the public wrapper only after its native module exists. A top-level
      // import crashes old dev builds; Jest's CommonJS runner cannot import().
      releaseFile = retainDownloadedFile(uri);
      const instance = api.createVideoPlayer(null);
      player = instance;
      instance.loop = false;
      instance.allowsExternalPlayback = false;
      instance.staysActiveInBackground = false;
      instance.showNowPlayingNotification = false;
      instance.audioMixingMode = "doNotMix";
      statusSubscription = instance.addListener(
        "statusChange",
        ({ status }) => {
          if (!alive) return;
          if (status === "error") fail();
          else setLoading(status !== "readyToPlay");
        },
      );
      appSubscription = AppState.addEventListener("change", (state) => {
        if (state !== "active" && alive) {
          // Fence a pending prepare before React has unmounted the modal.
          alive = false;
          try {
            instance.pause();
          } catch {
            // Closing still disposes a native player that already failed.
          } finally {
            onClose();
          }
        }
      });
      await instance.replaceAsync({ uri, useCaching: false });
      if (alive) {
        setSession({ uri, api, player: instance });
        instance.play();
      }
    };
    void prepare().catch(fail);
    return dispose;
  }, [uri, onError, onClose]);

  const current = session?.uri === uri ? session : null;
  const VideoView = current?.api.VideoView;
  return (
    <View style={{ flex: 1 }}>
      {loading ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
          동영상 준비 중…
        </Text>
      ) : null}
      {VideoView && current ? (
        <VideoView
          accessibilityLabel="동영상 플레이어"
          player={current.player}
          nativeControls
          contentFit="contain"
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
          requiresLinearPlayback={false}
          style={{ flex: 1, width: "100%" }}
        />
      ) : null}
    </View>
  );
}
