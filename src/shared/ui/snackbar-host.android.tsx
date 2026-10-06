import { Host } from "@expo/ui";
import { SnackbarHost as ComposeSnackbarHost } from "@expo/ui/jetpack-compose";
import type {
  SnackbarHostRef,
  SnackbarResult,
  SnackbarShowOptions,
} from "@expo/ui/jetpack-compose";
import { testID as testIDModifier } from "@expo/ui/jetpack-compose/modifiers";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useWindowDimensions } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

export type { SnackbarHostRef, SnackbarResult, SnackbarShowOptions };

export const SNACKBAR_DEFAULT_RETRY_LABEL = "다시 시도";

export type AndroidSnackbarHostProps = Readonly<{ testID?: string }>;

// Room for a two-line Snackbar plus its M3 margins; the host covers only
// this bottom band, never the screen. 160 is the 1.0x base: the mounted
// band height scales up with the system font size so larger text never
// clips against a fixed band.
const SNACKBAR_BAND_HEIGHT = 160;

/**
 * Hosts `@expo/ui/jetpack-compose`'s `SnackbarHost` in a bottom band that
 * is mounted only while a Snackbar is showing. This is the Android "list
 * has rows" error path from C1: a pagination failure shows a Snackbar with
 * a `다시 시도` action instead of replacing the list (iOS's counterpart is
 * `StandardStateViewErrorRow`). The caller drives it imperatively through
 * the forwarded ref's `showSnackbar`, whose returned promise resolves with
 * the Compose result (`"actionPerformed"` | `"dismissed"`) so it can decide
 * whether to retry.
 *
 * A permanently mounted full-screen host looked touch-transparent
 * (`pointerEvents="box-none"`) but its Compose child still won React
 * Native's hit test, so every `Pressable` under it (chat bubbles,
 * attachments, the new-message pill) stopped receiving touches on device.
 */
export const AndroidSnackbarHost = forwardRef<
  SnackbarHostRef,
  AndroidSnackbarHostProps
>(function AndroidSnackbarHost({ testID }, ref) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const { fontScale } = useWindowDimensions();
  const composeRef = useRef<SnackbarHostRef>(null);
  const [showing, setShowing] = useState(0);
  // The native SnackbarHost rejects calls until its Compose content has laid
  // out (on device: "Call to function 'SnackbarHostView.showSnackbar' has
  // been rejected"), so requests wait for the host's content layout.
  const [contentReady, setContentReady] = useState(false);
  const contentReadyRef = useRef(false);
  const mountWaiters = useRef<(() => void)[]>([]);
  useEffect(() => {
    if (showing > 0) return;
    contentReadyRef.current = false;
    setContentReady(false);
  }, [showing]);
  useEffect(() => {
    if (!contentReady || composeRef.current === null) return;
    const waiters = mountWaiters.current;
    mountWaiters.current = [];
    for (const resolve of waiters) resolve();
  }, [contentReady]);
  useImperativeHandle(
    ref,
    () => ({
      showSnackbar: async (options: SnackbarShowOptions) => {
        setShowing((count) => count + 1);
        try {
          await new Promise<void>((resolve) => {
            if (contentReadyRef.current && composeRef.current) resolve();
            else mountWaiters.current.push(resolve);
          });
          return await composeRef.current!.showSnackbar(options);
        } finally {
          setShowing((count) => count - 1);
        }
      },
    }),
    [],
  );
  if (showing === 0) return null;
  return (
    <Host
      onLayoutContent={() => {
        contentReadyRef.current = true;
        setContentReady(true);
      }}
      pointerEvents="box-none"
      seedColor={hex.primary}
      style={{
        bottom: 0,
        height: SNACKBAR_BAND_HEIGHT * Math.max(1, fontScale),
        left: 0,
        position: "absolute",
        right: 0,
      }}
      testID={testID}
    >
      <ComposeSnackbarHost
        modifiers={testID ? [testIDModifier(`${testID}-host`)] : undefined}
        ref={composeRef}
      />
    </Host>
  );
});
