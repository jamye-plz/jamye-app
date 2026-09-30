import { Host, ListItem, RNHostView } from "@expo/ui";
import {
  Button,
  Form,
  HStack,
  Image,
  Section,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import {
  disabled,
  foregroundStyle,
  frame,
  listRowBackground,
  listRowInsets,
} from "@expo/ui/swift-ui/modifiers";
import { Stack, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";

import { useAccountScope } from "@/core/providers/app-providers";
import { useSession } from "@/core/providers/session-provider";
import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { useAccountLifecycle } from "@/features/account/model/use-account-lifecycle";
import { useDeleteAccountFlow } from "@/features/account/model/use-delete-account-flow";
import { DeveloperSection } from "@/features/account/ui/developer-section";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import { NotificationSettingsSection } from "@/features/notifications/ui/notification-settings-section";
import { AppText } from "@/shared/ui/app-text";
import { Avatar } from "@/shared/ui/avatar";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";

import {
  deleteConfirmMessage,
  DELETE_CONFIRM_TITLE,
  LOGOUT_CONFIRM_TITLE,
  providerLoginLabel,
  STORAGE_ERROR_TEXT,
} from "./account-screen.constants";

// The inset-grouped row's side margins; the header block stays inside them.
const HEADER_HORIZONTAL_INSETS = 64;

/**
 * A1-A4 (iOS): native `Form`/`Section` account settings list. The profile
 * header (existing RN `Avatar` + nickname + provider) is the Form's first,
 * title-less `Section`, bridged in via `RNHostView` (DESIGN.md §4 interop --
 * RN content inside a Host tree). Android renders `account-screen.android.tsx`;
 * this screen is native-first like `group-rename-dialog.*`, so there is no
 * generic web fallback (matches that precedent -- no base `account-screen.tsx`).
 */
export function AccountScreen() {
  const session = useSession();
  const account = useAccountScope();
  const pushLifecycle = usePushLifecycle();
  const router = useRouter();
  const { colors } = useAppThemeOrSystem();
  const { width: windowWidth } = useWindowDimensions();
  const accountLifecycle = useAccountLifecycle();
  const deleteFlow = useDeleteAccountFlow(accountLifecycle);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const logoutPending = useRef(false);
  const profile = session.state.profile;

  // P4 (best-effort delete) must fire while this account's access token is
  // still valid, before session.logout() clears local credentials.
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
  // The developer section already shows storage status (any state) when
  // __DEV__ is true; this fallback keeps the error + retry visible in every
  // build when it is not (A3: "계정 저장소 오류일 때만 ... 모두에게 표시").
  const showStorageErrorToEveryone = storageStatus === "error" && !__DEV__;

  return (
    <>
      <Stack.Screen options={{ title: "계정" }} />
      <Host
        style={{ flex: 1 }}
        testID="account-screen"
        useViewportSizeMeasurement
      >
        <Form>
          {/* A1 header: a background-less first row, so it reads as a
              header above the settings list. The RN block gets an explicit
              width, because a content-sized host in a List row has no width
              to lay its centered text out against (it rendered clipped). */}
          <Section>
            <VStack
              modifiers={[
                frame({ maxWidth: Infinity }),
                listRowBackground("clear"),
                listRowInsets({ bottom: 0, leading: 0, top: 0, trailing: 0 }),
              ]}
            >
              <RNHostView matchContents>
                <View
                  style={{
                    alignItems: "center",
                    gap: appSpacing.xs,
                    paddingVertical: appSpacing.md,
                    width: windowWidth - HEADER_HORIZONTAL_INSETS,
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
            </VStack>
          </Section>
          <Section title="프로필">
            <ListItem
              onPress={() => router.push("/account/nickname")}
              testID="nickname-row"
              trailing={
                <HStack spacing={6}>
                  <Text
                    modifiers={[
                      foregroundStyle({
                        style: "secondary",
                        type: "hierarchical",
                      }),
                    ]}
                  >
                    {profile.nickname}
                  </Text>
                  <Image
                    modifiers={[
                      foregroundStyle({
                        style: "tertiary",
                        type: "hierarchical",
                      }),
                    ]}
                    size={13}
                    systemName="chevron.right"
                  />
                </HStack>
              }
            >
              <Text>닉네임</Text>
            </ListItem>
          </Section>
          <NotificationSettingsSection />
          <Section>
            <Button
              label="로그아웃"
              modifiers={loggingOut ? [disabled(true)] : undefined}
              onPress={() => setLogoutConfirmVisible(true)}
              role="destructive"
              testID="logout-row"
            />
          </Section>
          <Section>
            <Button
              label="계정 삭제"
              modifiers={deleteFlow.pending ? [disabled(true)] : undefined}
              onPress={deleteFlow.requestConfirm}
              role="destructive"
              testID="delete-account-row"
            />
          </Section>
          {showStorageErrorToEveryone ? (
            <Section>
              <ListItem testID="storage-error-row">
                <Text>{STORAGE_ERROR_TEXT}</Text>
              </ListItem>
              <ListItem onPress={account.retry} testID="storage-retry-row">
                <Text>계정 저장소 다시 시도</Text>
              </ListItem>
            </Section>
          ) : undefined}
          {__DEV__ ? <DeveloperSection /> : undefined}
        </Form>
      </Host>
      {/* ConfirmAlert is a native alert and needs a Host (DESIGN.md §4). */}
      <Host>
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
      </Host>
    </>
  );
}
