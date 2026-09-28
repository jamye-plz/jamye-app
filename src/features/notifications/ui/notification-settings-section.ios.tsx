import { ListItem, Switch } from "@expo/ui";
import { Section, Text } from "@expo/ui/swift-ui";
import { Linking } from "react-native";

import { usePushLifecycle } from "../model/push-lifecycle-provider";
import {
  isPushBusy,
  isPushPermissionDenied,
  isPushRegistered,
} from "./notification-settings-section.shared";

const PERMISSION_DENIED_MESSAGE = "설정에서 알림을 허용해 주세요.";
const SECTION_FOOTER = "알림에 메시지 내용을 보여 줍니다.";

/**
 * A1/A3 (iOS, regular user): the "알림" `Section` with two toggle rows.
 * `ListItem`/`Switch` are universal (`@expo/ui`, already the row primitive
 * `account-screen.ios.tsx` uses everywhere else); `Section` is the only
 * swift-ui-specific import. Only the toggle state shows here -- the raw
 * push-lifecycle diagnostic text and masked Expo token moved to
 * `developer-section.ios.tsx` (`__DEV__`-only, A3).
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
    <Section footer={<Text>{SECTION_FOOTER}</Text>} title="알림">
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
    </Section>
  );
}
