import { Stack, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { useAccountScope } from "@/core/providers/app-providers";
import { useSession } from "@/core/providers/session-provider";
import { useAccountLifecycle } from "@/features/account/model/use-account-lifecycle";
import { useDeleteAccountFlow } from "@/features/account/model/use-delete-account-flow";
import { DeveloperSection } from "@/features/account/ui/developer-section";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import { NotificationSettingsSection } from "@/features/notifications/ui/notification-settings-section";
import { AppScreen } from "@/shared/ui/app-screen";
import { Avatar } from "@/shared/ui/avatar";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { GroupedSection } from "@/shared/ui/grouped-section";

import {
  deleteConfirmMessage,
  DELETE_CONFIRM_TITLE,
  LOGOUT_CONFIRM_TITLE,
  providerLoginLabel,
  STORAGE_ERROR_TEXT,
} from "./account-screen.constants";

/**
 * A1-A4: fallback for platforms without a native settings-list affordance
 * (web). iOS resolves to `account-screen.ios.tsx` (SwiftUI `Form`), Android
 * to `account-screen.android.tsx` (Compose `ListItem`s).
 */
export function AccountScreen() {
  const session = useSession();
  const account = useAccountScope();
  const pushLifecycle = usePushLifecycle();
  const router = useRouter();
  const accountLifecycle = useAccountLifecycle();
  const deleteFlow = useDeleteAccountFlow(accountLifecycle);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const logoutPending = useRef(false);
  const profile = session.state.profile;

  const handleLogout = useCallback(() => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    void pushLifecycle
      .disable()
      .catch(() => undefined)
      .then(() => session.logout())
      .finally(() => {
        logoutPending.current = false;
        setLoggingOut(false);
      });
  }, [pushLifecycle, session]);

  if (!session.principal || !profile) return null;

  const storageStatus = account.state?.status ?? "opening";
  const showStorageErrorToEveryone = storageStatus === "error" && !__DEV__;

  return (
    <>
      <Stack.Screen options={{ title: "계정" }} />
      <AppScreen>
        <GroupedSection>
          <GroupedRow
            leading={
              <Avatar
                name={profile.nickname}
                size={72}
                uri={profile.avatarUrl}
              />
            }
            subtitle={providerLoginLabel(profile.provider)}
            title={profile.nickname}
          />
        </GroupedSection>
        <GroupedSection title="프로필">
          <GroupedRow
            onPress={() => router.push("/account/nickname")}
            subtitle={profile.nickname}
            title="닉네임"
          />
        </GroupedSection>
        <NotificationSettingsSection />
        <GroupedSection>
          <GroupedRow
            accessibilityLabel="로그아웃"
            destructive
            disabled={loggingOut}
            onPress={() => setLogoutConfirmVisible(true)}
            title="로그아웃"
          />
        </GroupedSection>
        <GroupedSection>
          <GroupedRow
            accessibilityLabel="계정 삭제"
            destructive
            disabled={deleteFlow.pending}
            onPress={deleteFlow.requestConfirm}
            title="계정 삭제"
          />
        </GroupedSection>
        {showStorageErrorToEveryone ? (
          <GroupedSection>
            <GroupedRow title={STORAGE_ERROR_TEXT} />
            <GroupedRow onPress={account.retry} title="계정 저장소 다시 시도" />
          </GroupedSection>
        ) : null}
        {__DEV__ ? <DeveloperSection /> : null}
      </AppScreen>
      <ConfirmAlert
        cancelLabel="취소"
        confirmLabel="로그아웃"
        destructive
        isPresented={logoutConfirmVisible}
        onConfirm={() => {
          setLogoutConfirmVisible(false);
          handleLogout();
        }}
        onDismiss={() => setLogoutConfirmVisible(false)}
        testID="logout-confirm-alert"
        title={LOGOUT_CONFIRM_TITLE}
      />
      <ConfirmAlert
        cancelLabel="취소"
        confirmLabel="삭제"
        destructive
        isPresented={deleteFlow.confirmVisible}
        message={deleteConfirmMessage(profile.provider)}
        onConfirm={deleteFlow.confirmDelete}
        onDismiss={deleteFlow.dismissConfirm}
        testID="delete-confirm-alert"
        title={DELETE_CONFIRM_TITLE}
      />
      {/* task-app-device fix1: a blocked/error delete result surfaces here
          instead of an inline caption under the delete row -- a
          single-button acknowledge alert (U-decision 2026-09-30). */}
      <ConfirmAlert
        acknowledge
        confirmLabel="확인"
        isPresented={deleteFlow.failureMessage !== null}
        message={deleteFlow.failureMessage ?? undefined}
        onConfirm={deleteFlow.dismissFailure}
        onDismiss={deleteFlow.dismissFailure}
        testID="delete-failure-alert"
        title={DELETE_CONFIRM_TITLE}
      />
    </>
  );
}
