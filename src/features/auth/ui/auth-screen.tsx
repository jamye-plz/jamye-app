import { Stack } from "expo-router";
import { View } from "react-native";

import { appReturnUri, providerRedirectUri } from "@/core/auth/app-return-uri";
import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";

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
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AppScreen
        contentStyle={{
          gap: appSpacing.xl,
          justifyContent: "center",
          paddingVertical: appSpacing.xxxl,
        }}
        headered={false}
      >
        <View style={{ gap: appSpacing.sm }}>
          <AppText
            accessibilityRole="header"
            color={colors.text}
            variant="largeTitle"
          >
            잼얘좀
          </AppText>
          <AppText color={colors.textMuted} variant="body">
            카카오 또는 Google 계정으로 로그인합니다.
          </AppText>
        </View>
        <View style={{ gap: appSpacing.sm }}>
          <NativeButton
            disabled={disabled}
            label={disabled ? "로그인 준비 중…" : "카카오로 계속하기"}
            onPress={() =>
              void session.login(
                "kakao",
                providerRedirectUri(origin, "kakao"),
                appReturnUri("kakao"),
              )
            }
            variant="filled"
          />
          <NativeButton
            disabled={disabled}
            label="Google로 계속하기"
            onPress={() =>
              void session.login(
                "google",
                providerRedirectUri(origin, "google"),
                appReturnUri("google"),
              )
            }
            variant="outlined"
          />
        </View>
        {state.message ? (
          <InlineMessage
            kind={state.status === "error" ? "error" : "notice"}
            message={state.message}
          >
            {retryAction && retryOperation ? (
              <NativeButton
                label={RETRY_LABELS[retryAction]}
                onPress={() => void retryOperation()}
                variant="text"
              />
            ) : null}
          </InlineMessage>
        ) : null}
      </AppScreen>
    </>
  );
}
