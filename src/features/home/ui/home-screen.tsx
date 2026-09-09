import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useAccountScope } from "@/core/providers/app-providers";
import type { AccountScopeContextValue } from "@/core/providers/app-providers";
import { useSession } from "@/core/providers/session-provider";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appRadii, appSpacing } from "@/core/theme/tokens";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";

import { ConnectionDiagnostics } from "./connection-diagnostics";

type ThemeColors = ReturnType<typeof useAppTheme>["colors"];

export function HomeScreen({
  embedded = false,
}: Readonly<{ embedded?: boolean }>) {
  const { colors } = useAppTheme();
  const session = useSession();
  const account = useAccountScope();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const profile = session.state.profile;

  const handleLogout = useCallback(() => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    void session.logout().finally(() => {
      logoutPending.current = false;
      setLoggingOut(false);
    });
  }, [session]);

  if (!session.principal || !profile) return null;

  const content = (
    <View style={styles.content}>
      <View accessibilityRole="header">
        <AppText color={colors.text} variant="title">
          {profile.nickname}
        </AppText>
        <AppText color={colors.textMuted}>
          {profile.provider} 계정으로 로그인됨
        </AppText>
      </View>
      <Pressable
        accessibilityLabel="로그아웃"
        accessibilityRole="button"
        accessibilityState={{ disabled: loggingOut }}
        disabled={loggingOut}
        onPress={handleLogout}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: loggingOut ? colors.surfaceMuted : colors.primary,
            opacity: pressed ? 0.84 : 1,
          },
        ]}
      >
        <AppText
          color={loggingOut ? colors.textMuted : colors.onPrimary}
          variant="label"
        >
          로그아웃
        </AppText>
      </Pressable>
      <AccountScopeStatus
        colors={colors}
        onRetry={account.retry}
        state={account.state}
      />
      <ConnectionDiagnostics />
    </View>
  );
  return embedded ? (
    content
  ) : (
    <AppScreen backgroundColor={colors.background}>{content}</AppScreen>
  );
}

function AccountScopeStatus({
  colors,
  state,
  onRetry,
}: Readonly<{
  colors: ThemeColors;
  state: AccountScopeContextValue["state"];
  onRetry: () => void;
}>) {
  if (!state || state.status === "opening") {
    return (
      <AppText
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        color={colors.textMuted}
      >
        로컬 계정 저장소 준비 중…
      </AppText>
    );
  }

  if (state.status === "error") {
    return (
      <View style={styles.retry}>
        <AppText accessibilityLiveRegion="polite" color={colors.error}>
          로컬 계정 저장소를 열 수 없습니다. 다시 시도해 주세요.
        </AppText>
        <Pressable
          accessibilityLabel="계정 저장소 다시 시도"
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed ? 0.84 : 1 },
          ]}
        >
          <AppText color={colors.onPrimary} variant="label">
            계정 저장소 다시 시도
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <AppText accessibilityLiveRegion="polite" color={colors.textMuted}>
      로컬 계정 저장소 준비됨
    </AppText>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appSpacing.xl,
    paddingVertical: appSpacing.xxxl,
  },
  retry: { gap: appSpacing.sm },
  button: {
    alignItems: "center",
    borderRadius: appRadii.medium,
    justifyContent: "center",
    minHeight: appControl.standardHeight,
    paddingHorizontal: appSpacing.md,
  },
});
