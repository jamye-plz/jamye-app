import type { ButtonVariant } from "@expo/ui";
import { Button, Host } from "@expo/ui";
import { useEffect, useState } from "react";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";

/**
 * `@expo/ui`'s `Button` has no `accessibilityHint`, so unlike the legacy
 * `GroupButton`/`TopicButton` the "retry after a wait" hint is conveyed by
 * the button's disabled state alone (and by the caller's surrounding inline
 * message text), not by an explicit hint string.
 *
 * Full-width layout: `transformStyle.ios.ts` casts `style.width` straight to
 * `number` (`frame({ width: style.width as number })`) before handing it to
 * SwiftUI's `.frame(width:)`, which expects a concrete point value, not a
 * percentage string. Passing `"100%"` would violate that cast at the native
 * boundary, and this task may not run `expo prebuild`/`run:ios` to verify
 * the native behavior. We therefore only stretch the outer `Host` (typed as
 * a full RN `ViewProps`, so `alignSelf: "stretch"` is safe) and leave the
 * `Button` itself content-sized/centered, which HIG allows as a fallback.
 * A later stage can measure a concrete pixel width (e.g. via
 * `onLayoutContent`) if true full-width buttons are required.
 */
export function NativeButton({
  label,
  onPress,
  variant = "filled",
  disabled = false,
  busy = false,
  retryAt = 0,
  destructive = false,
  testID,
}: Readonly<{
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  retryAt?: number;
  destructive?: boolean;
  testID?: string;
}>) {
  const { colors } = useAppThemeOrSystem();
  const [clock, setClock] = useState(Date.now);
  const waiting = retryAt > clock;
  const unavailable = disabled || busy || waiting;

  useEffect(() => {
    const remaining = retryAt - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(remaining, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [retryAt, clock]);

  return (
    <Host
      matchContents
      seedColor={destructive ? colors.error : colors.primary}
      // minHeight keeps the host visible even where matchContents cannot report
      // its measured size back (e.g. inside a FlatList header on Android).
      style={{ alignSelf: "stretch", minHeight: 44 }}
    >
      <Button
        disabled={unavailable}
        label={busy ? `${label} 처리 중…` : label}
        onPress={onPress}
        testID={testID}
        variant={variant}
      />
    </Host>
  );
}
