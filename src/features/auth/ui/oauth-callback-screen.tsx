import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appRadii, appSpacing } from "@/core/theme/tokens";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";

export function OAuthCallbackScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <AppScreen
      backgroundColor={colors.background}
      contentStyle={styles.content}
    >
      <AppText accessibilityRole="header" color={colors.text} variant="title">
        로그인 요청을 확인할 수 없습니다
      </AppText>
      <AppText color={colors.textMuted}>
        앱에서 새 로그인 요청을 시작해 주세요.
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="로그인 화면으로 돌아가기"
        onPress={() => router.replace("/")}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary, opacity: pressed ? 0.84 : 1 },
        ]}
      >
        <AppText color={colors.onPrimary} variant="label">
          로그인 화면으로 돌아가기
        </AppText>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: appSpacing.md, justifyContent: "center" },
  button: {
    alignItems: "center",
    borderRadius: appRadii.medium,
    justifyContent: "center",
    minHeight: appControl.standardHeight,
    paddingHorizontal: appSpacing.md,
  },
});
