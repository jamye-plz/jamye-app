import { Host } from "@expo/ui";
import { SnackbarHost as ComposeSnackbarHost } from "@expo/ui/jetpack-compose";
import type {
  SnackbarHostRef,
  SnackbarResult,
  SnackbarShowOptions,
} from "@expo/ui/jetpack-compose";
import { testID as testIDModifier } from "@expo/ui/jetpack-compose/modifiers";
import { forwardRef } from "react";
import { StyleSheet } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

export type { SnackbarHostRef, SnackbarResult, SnackbarShowOptions };

export const SNACKBAR_DEFAULT_RETRY_LABEL = "다시 시도";

export type AndroidSnackbarHostProps = Readonly<{ testID?: string }>;

/**
 * Positions `@expo/ui/jetpack-compose`'s `SnackbarHost` as a full-screen,
 * touch-transparent overlay. This is the Android "list has rows" error path
 * from C1: a pagination failure shows a Snackbar with a `다시 시도` action
 * instead of replacing the list (iOS's counterpart is
 * `StandardStateViewErrorRow`). The caller drives it imperatively through the
 * forwarded ref's `showSnackbar`, whose returned promise resolves with the
 * Compose result (`"actionPerformed"` | `"dismissed"`) so it can decide
 * whether to retry.
 */
export const AndroidSnackbarHost = forwardRef<
  SnackbarHostRef,
  AndroidSnackbarHostProps
>(function AndroidSnackbarHost({ testID }, ref) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  return (
    <Host
      pointerEvents="box-none"
      seedColor={hex.primary}
      style={StyleSheet.absoluteFill}
      testID={testID}
    >
      <ComposeSnackbarHost
        modifiers={testID ? [testIDModifier(`${testID}-host`)] : undefined}
        ref={ref}
      />
    </Host>
  );
});
