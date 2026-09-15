import { Stack } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";

import { useAccountScope } from "@/core/providers/app-providers";
import { useSession } from "@/core/providers/session-provider";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { NativeButton } from "@/shared/ui/native-button";

import { ConnectionDiagnostics } from "./connection-diagnostics";

const STORAGE_STATUS_TEXT = {
  opening: "로컬 계정 저장소 준비 중…",
  ready: "로컬 계정 저장소 준비됨",
  error: "로컬 계정 저장소를 열 수 없습니다. 다시 시도해 주세요.",
} as const;

export function AccountScreen() {
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

  const storageStatus = account.state?.status ?? "opening";
  const storageSubtitle = STORAGE_STATUS_TEXT[storageStatus];

  return (
    <>
      <Stack.Screen options={{ title: "계정" }} />
      <AppScreen>
        <GroupedSection>
          <GroupedRow
            leading={<AppSymbol name="account" />}
            subtitle={`${profile.provider} 계정으로 로그인됨`}
            title={profile.nickname}
          />
        </GroupedSection>
        <GroupedSection title="로컬 계정 저장소">
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole={
              storageStatus === "opening" ? "progressbar" : undefined
            }
            accessible={storageStatus === "opening"}
          >
            <GroupedRow
              subtitle={storageSubtitle}
              title="계정 저장소"
              trailing={
                storageStatus === "error" ? (
                  <NativeButton
                    label="계정 저장소 다시 시도"
                    onPress={account.retry}
                    variant="text"
                  />
                ) : undefined
              }
            />
          </View>
        </GroupedSection>
        <GroupedSection title="서버 연결 진단">
          <ConnectionDiagnostics />
        </GroupedSection>
        <GroupedSection>
          <GroupedRow
            accessibilityLabel="로그아웃"
            destructive
            disabled={loggingOut}
            onPress={handleLogout}
            title="로그아웃"
          />
        </GroupedSection>
      </AppScreen>
    </>
  );
}
