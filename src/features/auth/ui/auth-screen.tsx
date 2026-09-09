import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { createAuthApi } from "@/core/auth/auth-api";
import { createAuthController } from "@/core/auth/auth-controller";
import { appReturnUri, providerRedirectUri } from "@/core/auth/app-return-uri";
import { createPkcePair } from "@/core/auth/pkce";
import { secureSessionStore } from "@/core/auth/secure-session-store";
import { getPublicEnv } from "@/core/config/public-env";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appRadii, appSpacing } from "@/core/theme/tokens";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";

export function AuthScreen() {
  const { colors } = useAppTheme();
  const env = getPublicEnv();
  const origin = env.apiOrigin;
  if (!origin) throw new Error("connected-auth requires an API origin.");
  const controller = useMemo(
    () =>
      createAuthController({
        origin,
        api: createAuthApi(origin),
        store: secureSessionStore,
        createPkce: createPkcePair,
        openBrowser: async (url, callback) => {
          const result = await WebBrowser.openAuthSessionAsync(url, callback);
          return result.type === "success"
            ? { type: "success" as const, url: result.url }
            : {
                type:
                  result.type === "cancel"
                    ? ("cancel" as const)
                    : ("dismiss" as const),
              };
        },
      }),
    [origin],
  );
  const [state, setState] = useState(controller.getState());
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void controller.restore();
    return unsubscribe;
  }, [controller]);
  const disabled = state.status === "loading" || state.status === "signing-in";
  const retryAction = state.status === "error" ? state.retryAction : undefined;
  const retryLabels = {
    restore: "세션 복원 다시 시도",
    retryProfile: "프로필 다시 시도",
    logout: "로그아웃 다시 시도",
  };

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
      {state.status === "signed-in" && state.profile ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <AppText color={colors.text} variant="label">
            {state.profile.nickname}
          </AppText>
          <AppText color={colors.textMuted}>
            {state.profile.provider} 계정으로 로그인됨
          </AppText>
          <AuthButton
            label="로그아웃"
            disabled={false}
            colors={colors}
            onPress={() => void controller.logout()}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <AuthButton
            label={disabled ? "로그인 준비 중…" : "카카오로 계속하기"}
            disabled={disabled}
            colors={colors}
            onPress={() =>
              void controller.signIn(
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
              void controller.signIn(
                "google",
                providerRedirectUri(origin, "google"),
                appReturnUri("google"),
              )
            }
          />
        </View>
      )}
      {state.message ? (
        <View style={styles.retry}>
          <AppText
            accessibilityLiveRegion="polite"
            color={state.status === "error" ? colors.error : colors.textMuted}
          >
            {state.message}
          </AppText>
          {retryAction ? (
            <AuthButton
              label={retryLabels[retryAction]}
              disabled={false}
              colors={colors}
              onPress={() => void controller[retryAction]()}
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
  card: {
    borderRadius: appRadii.medium,
    borderWidth: 1,
    gap: appSpacing.sm,
    padding: appSpacing.md,
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
