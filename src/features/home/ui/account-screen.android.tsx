import { Host, List, ListItem, RNHostView, Text } from "@expo/ui";
import { Stack, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";

import { useAccountScope } from "@/core/providers/app-providers";
import { useSession } from "@/core/providers/session-provider";
import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors, appSpacing } from "@/core/theme/tokens";
import { useAccountLifecycle } from "@/features/account/model/use-account-lifecycle";
import { useDeleteAccountFlow } from "@/features/account/model/use-delete-account-flow";
import { DeveloperSection } from "@/features/account/ui/developer-section";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import { NotificationSettingsSection } from "@/features/notifications/ui/notification-settings-section";
import { AppText } from "@/shared/ui/app-text";
import { Avatar } from "@/shared/ui/avatar";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import { ListSubheader } from "@/shared/ui/list-subheader";

import {
  deleteConfirmMessage,
  DELETE_CONFIRM_TITLE,
  LOGOUT_CONFIRM_TITLE,
  providerLoginLabel,
  STORAGE_ERROR_TEXT,
} from "./account-screen.constants";

/**
 * A1-A4 (Android): flat M3 `ListItem` rows in a single `List`, with a plain
 * `Text` subheader standing in for "프로필" (there is no dedicated universal
 * subheader component). Mirrors `account-screen.ios.tsx`'s composition;
 * `NotificationSettingsSection`/`DeveloperSection` resolve to their own
 * `.android.tsx` files.
 */
export function AccountScreen() {
  const session = useSession();
  const account = useAccountScope();
  const pushLifecycle = usePushLifecycle();
  const router = useRouter();
  const { colorScheme, colors } = useAppThemeOrSystem();
  const { width: windowWidth } = useWindowDimensions();
  const hex = androidThemeColors(colorScheme);
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

  // `ListItem`'s onPress must stay a defined function at all times: the
  // Android universal implementation flips its Compose `modifiers` prop
  // between an array and `undefined` based on onPress' presence, and
  // `undefined` fails the native prop cast (LogBox `PropSetException`,
  // r2-18 / 기기 결함 9). Guard the in-flight state inside the handler
  // instead of conditionally passing `undefined`.
  const handleLogoutRowPress = useCallback(() => {
    if (loggingOut) return;
    setLogoutConfirmVisible(true);
  }, [loggingOut]);

  const handleDeleteRowPress = useCallback(() => {
    if (deleteFlow.pending) return;
    deleteFlow.requestConfirm();
  }, [deleteFlow]);

  if (!session.principal || !profile) return null;

  const storageStatus = account.state?.status ?? "opening";
  const showStorageErrorToEveryone = storageStatus === "error" && !__DEV__;

  return (
    <>
      <Stack.Screen options={{ title: "계정" }} />
      <Host seedColor={hex.primary} style={{ flex: 1 }} testID="account-screen">
        <List>
          {/* A content-sized RN host in the LazyColumn gets the full row
              width explicitly so the header stays centered (DESIGN.md §4). */}
          <RNHostView matchContents>
            <View
              style={{
                alignItems: "center",
                gap: appSpacing.xs,
                paddingVertical: appSpacing.md,
                width: windowWidth,
              }}
            >
              <Avatar
                name={profile.nickname}
                size={72}
                testID="account-avatar"
                uri={profile.avatarUrl}
              />
              <AppText variant="title">{profile.nickname}</AppText>
              <AppText color={colors.textMuted}>
                {providerLoginLabel(profile.provider)}
              </AppText>
            </View>
          </RNHostView>
          <ListSubheader testID="profile-section-header">프로필</ListSubheader>
          <ListItem
            onPress={() => router.push("/account/nickname")}
            testID="nickname-row"
            trailing={<Text>{profile.nickname}</Text>}
          >
            <Text>닉네임</Text>
          </ListItem>
          <NotificationSettingsSection />
          <ListItem onPress={handleLogoutRowPress} testID="logout-row">
            <Text textStyle={{ color: hex.error }}>로그아웃</Text>
          </ListItem>
          <ListItem onPress={handleDeleteRowPress} testID="delete-account-row">
            <Text textStyle={{ color: hex.error }}>계정 삭제</Text>
          </ListItem>
          {showStorageErrorToEveryone ? (
            <>
              <ListItem testID="storage-error-row">
                <Text>{STORAGE_ERROR_TEXT}</Text>
              </ListItem>
              <ListItem onPress={account.retry} testID="storage-retry-row">
                <Text>계정 저장소 다시 시도</Text>
              </ListItem>
            </>
          ) : undefined}
          {__DEV__ ? <DeveloperSection /> : undefined}
        </List>
      </Host>
      {/* ConfirmAlert is a native alert and needs a Host (DESIGN.md §4). */}
      <Host seedColor={hex.primary}>
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
            single-button acknowledge Material dialog (U-decision
            2026-09-30). */}
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
      </Host>
    </>
  );
}
