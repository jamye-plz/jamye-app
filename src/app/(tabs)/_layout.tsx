import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useAppTheme } from "@/core/theme/theme-provider";
import type { AppThemeColors } from "@/core/theme/tokens";
import { useNotificationsUnreadCount } from "@/features/notifications/ui/use-notifications-unread-count";
import { APP_SYMBOLS } from "@/shared/ui/app-symbol";

/** Badge text for the notifications tab; hidden at zero, capped at 99+. */
export function resolveNotificationsTabBadge(
  unreadCount: number,
): string | undefined {
  if (unreadCount <= 0) return undefined;
  return unreadCount > 99 ? "99+" : String(unreadCount);
}

/**
 * Android colors for the Material 3 navigation bar (ADR 0011): the bar sits on
 * the surface container, the active pill is the accent container, and only
 * the selected icon/label carry the Berry highlight. iOS keeps the glass tab
 * bar's platform defaults, so this returns nothing there.
 */
export function resolveNativeTabsPlatformProps(
  os: string | undefined,
  colors: AppThemeColors,
) {
  if (os !== "android") return {};
  return {
    backgroundColor: colors.surface,
    iconColor: { default: colors.textMuted, selected: colors.primary },
    indicatorColor: colors.accentContainer,
    labelStyle: {
      default: { color: colors.textMuted },
      selected: { color: colors.primary },
    },
  };
}

/**
 * Top-level tab bar (ADR 0009) drawn by the platform (ADR 0010): a
 * UITabBarController on iOS, which iOS 26 renders in Liquid Glass, and a
 * Material 3 navigation bar on Android. Each tab owns a native Stack so screen
 * titles keep the ADR 0005 D3 header rules; the chat screen and the
 * create/join/new-topic modals stay on the root Stack.
 */
export default function TabsLayout() {
  const { colors } = useAppTheme();
  const badge = resolveNotificationsTabBadge(useNotificationsUnreadCount());
  return (
    <NativeTabs
      tintColor={colors.primary}
      {...resolveNativeTabsPlatformProps(process.env.EXPO_OS, colors)}
    >
      <NativeTabs.Trigger name="groups">
        <NativeTabs.Trigger.Icon
          md={APP_SYMBOLS.group.android}
          sf={APP_SYMBOLS.group.ios}
        />
        <NativeTabs.Trigger.Label>그룹</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications">
        <NativeTabs.Trigger.Icon
          md={APP_SYMBOLS.notification.android}
          sf={APP_SYMBOLS.notification.ios}
        />
        <NativeTabs.Trigger.Label>알림</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={badge === undefined}>
          {badge}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon
          md={APP_SYMBOLS.account.android}
          sf={APP_SYMBOLS.account.ios}
        />
        <NativeTabs.Trigger.Label>계정</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
