import { ListItem, Switch, Text } from "@expo/ui";
import { Linking } from "react-native";

import { ListSubheader } from "@/shared/ui/list-subheader";

import { usePushLifecycle } from "../model/push-lifecycle-provider";
import {
  isPushBusy,
  isPushPermissionDenied,
  isPushRegistered,
} from "./notification-settings-section.shared";

const PERMISSION_DENIED_MESSAGE = "설정에서 알림을 허용해 주세요.";
const SECTION_FOOTER = "알림에 메시지 내용을 보여 줍니다.";

/**
 * A1/A3 (Android, regular user): flat M3 rows via universal `ListItem`/
 * `Switch`/`Text` -- already native Compose primitives on Android, so no
 * jetpack-compose-specific import is needed. `ListSubheader` stands in for
 * the M3 list subheader, and the preview description is the preview row's
 * supporting text.
 * The parent `account-screen.android.tsx` owns the single `Host`/`List`
 * this renders into.
 */
export function NotificationSettingsSection() {
  const { disable, enable, previewEnabled, setMessagePreview, state } =
    usePushLifecycle();
  const pushRegistered = isPushRegistered(state);
  const busy = isPushBusy(state);
  const permissionDenied = isPushPermissionDenied(state);

  function handleTogglePush(value: boolean): void {
    if (value) void enable();
    else void disable();
  }

  function handleTogglePreview(value: boolean): void {
    void setMessagePreview(value);
  }

  function handleOpenSettings(): void {
    void Linking.openSettings();
  }

  return (
    <>
      <ListSubheader testID="notification-section-header">알림</ListSubheader>
      <ListItem
        testID="push-notifications-row"
        trailing={
          <Switch
            disabled={busy}
            onValueChange={handleTogglePush}
            testID="push-notifications-switch"
            value={pushRegistered}
          />
        }
      >
        <Text>푸시 알림</Text>
      </ListItem>
      {permissionDenied ? (
        <ListItem testID="push-permission-denied-row">
          <Text>{PERMISSION_DENIED_MESSAGE}</Text>
        </ListItem>
      ) : null}
      {permissionDenied ? (
        <ListItem onPress={handleOpenSettings} testID="open-settings-row">
          <Text>설정 열기</Text>
        </ListItem>
      ) : null}
      <ListItem
        supportingText={SECTION_FOOTER}
        testID="message-preview-row"
        trailing={
          <Switch
            disabled={!pushRegistered}
            onValueChange={handleTogglePreview}
            testID="message-preview-switch"
            value={previewEnabled}
          />
        }
      >
        <Text>메시지 미리보기</Text>
      </ListItem>
    </>
  );
}
