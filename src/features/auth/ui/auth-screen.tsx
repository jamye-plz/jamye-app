import { Pressable, StyleSheet, View } from "react-native";

import { appReturnUri, providerRedirectUri } from "@/core/auth/app-return-uri";
import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appRadii, appSpacing } from "@/core/theme/tokens";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";

const RETRY_LABELS = {
  restore: "세션 복원 다시 시도",
  retryProfile: "프로필 다시 시도",
  logout: "로그아웃 다시 시도",
} as const;

export function AuthScreen() {
  const { colors } = useAppTheme();
  const env = getPublicEnv();
  const origin = env.apiOrigin;
  if (!origin) throw new Error("connected-auth requires an API origin.");
  const session = useSession();
  const state = session.state;
  const disabled = state.status === "loading" || state.status === "signing-in";
  const retryAction = state.status === "error" ? state.retryAction : undefined;
  const retryOperation =
    retryAction === "restore"
      ? session.restore
      : retryAction === "logout"
        ? session.logout
        : retryAction === "retryProfile"
          ? session.retryProfile
          : undefined;

  return (
    <AppScreen
      backgroundColor={colors.background}
      contentStyle={styles.content}
    >
      <View accessibilityRole="header">
        <AppText color={colors.text} variant="title">
          Jamye 로그인
        </AppText>
        <AppText color={colors.textMuted} style={styles.description}>
          카카오 또는 Google 계정으로 로그인합니다.
        </AppText>
      </View>
      <View style={styles.actions}>
        <AuthButton
          label={disabled ? "로그인 준비 중…" : "카카오로 계속하기"}
          disabled={disabled}
          colors={colors}
          onPress={() =>
            void session.login(
              "kakao",
              providerRedirectUri(origin, "kakao"),
              appReturnUri("kakao"),
            )
          }
        />
        <AuthButton
          label="Google로 계속하기"
          disabled={disabled}
          colors={colors}
          onPress={() =>
            void session.login(
              "google",
              providerRedirectUri(origin, "google"),
              appReturnUri("google"),
            )
          }
        />
      </View>
      {state.message ? (
        <View style={styles.retry}>
          <AppText
            accessibilityLiveRegion="polite"
            color={state.status === "error" ? colors.error : colors.textMuted}
          >
            {state.message}
          </AppText>
          {retryAction && retryOperation ? (
            <AuthButton
              label={RETRY_LABELS[retryAction]}
              disabled={false}
              colors={colors}
              onPress={() => void retryOperation()}
            />
          ) : null}
        </View>
      ) : null}
    </AppScreen>
  );
}

function AuthButton({
  label,
  disabled,
  colors,
  onPress,
}: Readonly<{
  label: string;
  disabled: boolean;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onPress: () => void;
}>) {
  return (
    <Pressable
      testID={`auth-${label}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? colors.surfaceMuted : colors.primary,
          opacity: pressed ? 0.84 : 1,
        },
      ]}
    >
      <AppText
        color={disabled ? colors.textMuted : colors.onPrimary}
        variant="label"
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appSpacing.xl,
    justifyContent: "center",
    paddingVertical: appSpacing.xxxl,
  },
  description: { marginTop: appSpacing.sm },
  actions: { gap: appSpacing.sm },
  retry: { gap: appSpacing.sm },
  button: {
    alignItems: "center",
    borderRadius: appRadii.medium,
    justifyContent: "center",
    minHeight: appControl.standardHeight,
    paddingHorizontal: appSpacing.md,
  },
});
