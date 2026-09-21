import { Stack } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { useAccountScope } from "@/core/providers/app-providers";
import { useSession } from "@/core/providers/session-provider";
import { AppScreen } from "@/shared/ui/app-screen";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { NativeButton } from "@/shared/ui/native-button";
import { createAccountApi } from "@/features/account/data/account-api";
import { createAccountLifecycle } from "@/features/account/model/account-lifecycle";
import { DeleteAccountSection } from "@/features/account/ui/delete-account-section";
import { NicknameSection } from "@/features/account/ui/nickname-section";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import { NotificationSettingsSection } from "@/features/notifications/ui/notification-settings-section";

import { ConnectionDiagnostics } from "./connection-diagnostics";

const STORAGE_STATUS_TEXT = {
  opening: "로컬 계정 저장소 준비 중…",
  ready: "로컬 계정 저장소 준비됨",
  error: "로컬 계정 저장소를 열 수 없습니다. 다시 시도해 주세요.",
} as const;

export function AccountScreen() {
  const session = useSession();
  const account = useAccountScope();
  const pushLifecycle = usePushLifecycle();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const profile = session.state.profile;

  // Built once per origin. Only the identity-stable session/push callbacks
  // are captured (not the whole context values), so a nickname save's own
  // profile publish or a token refresh never recreates the lifecycle and
  // never resets its shared in-flight guard mid-operation.
  const origin = session.principal?.origin ?? null;
  const { applyProfile, authorizedRequest, logout } = session;
  const { disable } = pushLifecycle;
  const accountLifecycle = useMemo(() => {
    if (!origin) return null;
    return createAccountLifecycle({
      accountApi: createAccountApi(origin),
      pushDisable: { disable },
      session: { applyProfile, authorizedRequest, logout },
    });
  }, [origin, applyProfile, authorizedRequest, logout, disable]);

  const handleLogout = useCallback(() => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    // P4 (best-effort delete) must fire while this account's access token is
    // still valid, before `session.logout()` clears local credentials.
    void pushLifecycle
      .disable()
      .catch(() => undefined)
      .then(() => session.logout())
      .finally(() => {
        logoutPending.current = false;
        setLoggingOut(false);
      });
  }, [pushLifecycle, session]);

  if (!session.principal || !profile || !accountLifecycle) return null;

  const storageStatus = account.state?.status ?? "opening";
  const storageSubtitle = STORAGE_STATUS_TEXT[storageStatus];

  return (
    <>
      <Stack.Screen options={{ title: "계정" }} />
      <AppScreen>
        <NicknameSection accountLifecycle={accountLifecycle} />
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
        <NotificationSettingsSection />
        <GroupedSection>
          <GroupedRow
            accessibilityLabel="로그아웃"
            destructive
            disabled={loggingOut}
            onPress={handleLogout}
            title="로그아웃"
          />
        </GroupedSection>
        <DeleteAccountSection accountLifecycle={accountLifecycle} />
      </AppScreen>
    </>
  );
}
