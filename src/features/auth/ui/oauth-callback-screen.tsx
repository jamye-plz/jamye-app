import { Stack, useRouter } from "expo-router";

import { AppScreen } from "@/shared/ui/app-screen";
import { EmptyState } from "@/shared/ui/empty-state";
import { NativeButton } from "@/shared/ui/native-button";

export function OAuthCallbackScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AppScreen headered={false}>
        <EmptyState
          description="앱에서 새 로그인 요청을 시작해 주세요."
          title="로그인 요청을 확인할 수 없습니다"
        >
          <NativeButton
            label="로그인 화면으로 돌아가기"
            onPress={() => router.replace("/")}
          />
        </EmptyState>
      </AppScreen>
    </>
  );
}
