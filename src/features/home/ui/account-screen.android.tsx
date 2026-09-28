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

const STORAGE_ERROR_TEXT =
  "로컬 계정 저장소를 열 수 없습니다. 다시 시도해 주세요.";
const DELETE_CONFIRM_TITLE = "계정 삭제";
const DELETE_CONFIRM_MESSAGE =
  "정말 계정을 삭제할까요? 이 작업은 되돌릴 수 없습니다.";
const LOGOUT_CONFIRM_TITLE = "로그아웃할까요?";
const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  kakao: "카카오",
};

function providerLoginLabel(provider: string): string {
  return `${PROVIDER_LABELS[provider] ?? provider} 계정으로 로그인됨`;
}

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
          <ListItem
            onPress={
              loggingOut ? undefined : () => setLogoutConfirmVisible(true)
            }
            testID="logout-row"
          >
            <Text textStyle={{ color: hex.error }}>로그아웃</Text>
          </ListItem>
          <ListItem
            onPress={deleteFlow.pending ? undefined : deleteFlow.requestConfirm}
            testID="delete-account-row"
          >
            <Text textStyle={{ color: hex.error }}>계정 삭제</Text>
          </ListItem>
          {deleteFlow.message ? (
            <Text
              testID="delete-account-message"
              textStyle={{ color: hex.error }}
            >
              {deleteFlow.message}
            </Text>
          ) : undefined}
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
          message={DELETE_CONFIRM_MESSAGE}
          onConfirm={deleteFlow.confirmDelete}
          onDismiss={deleteFlow.dismissConfirm}
          testID="delete-confirm-alert"
          title={DELETE_CONFIRM_TITLE}
        />
      </Host>
    </>
  );
}
