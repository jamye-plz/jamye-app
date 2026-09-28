import { Host } from "@expo/ui";
import { Stack, useRouter } from "expo-router";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { AppScreen } from "@/shared/ui/app-screen";
import { StandardStateView } from "@/shared/ui/standard-state-view";

/**
 * Round-2: the round-1 `EmptyState` gives way to the standard state view
 * (kind "error": an unverifiable callback has nothing recoverable in-place
 * to retry against, only a way back to start over), rendered inside a
 * `Host` per the M14 interop rule (SwiftUI/Compose state views must render
 * inside one). `useAppThemeOrSystem` -- not `useAppTheme` -- so this keeps
 * working even reached outside a full `AppThemeProvider` tree.
 */
export function OAuthCallbackScreen() {
  const router = useRouter();
  const { colors } = useAppThemeOrSystem();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AppScreen headered={false}>
        <Host seedColor={colors.primary} style={{ flex: 1 }}>
          <StandardStateView
            actions={[
              {
                label: "로그인 화면으로 돌아가기",
                onPress: () => router.replace("/"),
                primary: true,
              },
            ]}
            description="앱에서 새 로그인 요청을 시작해 주세요."
            kind="error"
            systemImage="error"
            title="로그인 요청을 확인할 수 없습니다"
          />
        </Host>
      </AppScreen>
    </>
  );
}
