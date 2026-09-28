import { Linking, Switch } from "react-native";

import { usePushLifecycle } from "../model/push-lifecycle-provider";
import {
  isPushBusy,
  isPushPermissionDenied,
  isPushRegistered,
} from "./notification-settings-section.shared";

const PERMISSION_DENIED_MESSAGE = "설정에서 알림을 허용해 주세요.";

/**
 * Fallback for platforms without a native settings-list affordance (web).
 * iOS resolves to `notification-settings-section.ios.tsx`, Android to
 * `notification-settings-section.android.tsx`.
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
      <Switch
        disabled={busy}
        onValueChange={handleTogglePush}
        testID="push-notifications-switch"
        value={pushRegistered}
      />
      {permissionDenied ? (
        <Switch
          disabled
          onValueChange={handleOpenSettings}
          testID="open-settings-row"
          value={false}
        />
      ) : null}
      {permissionDenied ? <>{PERMISSION_DENIED_MESSAGE}</> : null}
      <Switch
        disabled={!pushRegistered}
        onValueChange={handleTogglePreview}
        testID="message-preview-switch"
        value={previewEnabled}
      />
    </>
  );
}
