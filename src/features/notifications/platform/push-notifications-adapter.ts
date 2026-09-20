/**
 * Sole importer of `expo-notifications`/`expo-device` under
 * `src/features/notifications/`. Everything else in this feature (the pure
 * `push-lifecycle.ts` state machine, the UI layer) talks to this module's
 * plain-value API instead of the native modules directly, so the rest of
 * the feature stays testable without any native module mocked beyond this
 * file's own boundary. Enforced by a source-scan test in
 * `tests/features/notifications/platform/push-notifications-adapter.test.ts`.
 *
 * No native rebuild has happened yet for this project; every function here
 * degrades gracefully (never throws for a known, permanent diagnostic
 * condition) so the rest of the app can run fully mocked pending that
 * rebuild and the physical-device prerequisites tracked separately in
 * docs/evidence/M12.md.
 */
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type PushPermissionStatus = "granted" | "denied" | "undetermined";

export type PushTapHandoff = Readonly<{
  type: "new_topic" | "chat_unread" | "other";
  notificationId: string;
  conversationId: string;
  messageId: string | null;
}>;

/**
 * `ok: false` only ever carries `not_physical_device`: a missing EAS
 * `projectId` is a caller-level (Constants.expoConfig) precondition that
 * never reaches this function, so it can never be the cause of a token
 * failure observed here.
 */
export type ExpoPushTokenResult =
  | Readonly<{ ok: true; token: string }>
  | Readonly<{ ok: false; reason: "not_physical_device" }>;

export type Unsubscribe = () => void;

/** Device (APNs/FCM) token event forwarded by `onTokenChanged`. */
export type DevicePushTokenEvent = Readonly<{
  type: "ios" | "android";
  data: string;
}>;

const ANDROID_DEFAULT_CHANNEL_ID = "default";
const ANDROID_DEFAULT_CHANNEL_NAME = "기본 알림";

function mapPermissionStatus(status: {
  granted: boolean;
  status: string;
}): PushPermissionStatus {
  if (status.granted) return "granted";
  if (status.status === "denied") return "denied";
  return "undetermined";
}

/**
 * Pre-request check. Android 13+ reports a never-asked POST_NOTIFICATIONS
 * permission as `denied` with `canAskAgain: true` (iOS reports
 * `undetermined`), so an askable denial is treated as undetermined here to
 * let the caller show the system prompt; a real refusal (`canAskAgain:
 * false`, or the answer to `requestPermissions`) still maps to `denied`.
 */
export async function getPermissions(): Promise<PushPermissionStatus> {
  const status = await Notifications.getPermissionsAsync();
  if (!status.granted && status.status === "denied" && status.canAskAgain) {
    return "undetermined";
  }
  return mapPermissionStatus(status);
}

export async function requestPermissions(): Promise<PushPermissionStatus> {
  const status = await Notifications.requestPermissionsAsync();
  return mapPermissionStatus(status);
}

/**
 * Always attempts `getExpoPushTokenAsync`, even when `Device.isDevice` is
 * false: Expo documents that iOS 16+ simulators on Apple Silicon can
 * register for push. `not_physical_device` is only reported once the call
 * itself throws AND the device genuinely isn't real hardware; any other
 * thrown error (network, Expo outage) on a real device is rethrown as-is so
 * callers treat it as a transient failure, not a permanent diagnostic state.
 */
export async function getExpoPushToken(options: {
  projectId: string;
  /**
   * Pass the device token from an `onTokenChanged` event so Expo resolves
   * the push token from it instead of calling `getDevicePushTokenAsync()`,
   * which re-emits the token event and would loop forever.
   */
  devicePushToken?: DevicePushTokenEvent;
}): Promise<ExpoPushTokenResult> {
  try {
    const result = await Notifications.getExpoPushTokenAsync({
      projectId: options.projectId,
      ...(options.devicePushToken
        ? { devicePushToken: options.devicePushToken }
        : {}),
    });
    return { ok: true, token: result.data };
  } catch (error) {
    if (!Device.isDevice) return { ok: false, reason: "not_physical_device" };
    throw error;
  }
}

function parseDevicePushToken(event: unknown): DevicePushTokenEvent | null {
  if (!isRecord(event)) return null;
  const { type, data } = event;
  if (type !== "ios" && type !== "android") return null;
  if (typeof data !== "string" || data.length === 0) return null;
  return { data, type };
}

/**
 * Forwards well-formed device token events only. Expo's own guidance for
 * this listener: never call `getDevicePushTokenAsync()` from it (that
 * re-triggers the listener); callers resolve the Expo token via
 * `getExpoPushToken({ devicePushToken })` with the forwarded event.
 */
export function onTokenChanged(
  listener: (token: DevicePushTokenEvent) => void,
): Unsubscribe {
  const subscription = Notifications.addPushTokenListener((event) => {
    const token = parseDevicePushToken(event);
    if (token) listener(token);
  });
  return () => subscription.remove();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTapType(value: unknown): value is PushTapHandoff["type"] {
  return value === "new_topic" || value === "chat_unread" || value === "other";
}

/**
 * Parses the Expo push message `data` field (delivered into
 * `notification.request.content.data` on both foreground receipt and tap)
 * as `PushTapHandoff`. Never throws; an unrecognized shape resolves to
 * `null` so a malformed or unrelated payload is silently ignored by every
 * caller in this module.
 */
export function parsePushTapHandoff(data: unknown): PushTapHandoff | null {
  if (!isRecord(data)) return null;
  const { type, notification_id, conversation_id, message_id } = data;
  if (!isTapType(type)) return null;
  if (typeof notification_id !== "string" || notification_id.length === 0)
    return null;
  if (typeof conversation_id !== "string" || conversation_id.length === 0)
    return null;
  if (
    message_id !== null &&
    message_id !== undefined &&
    typeof message_id !== "string"
  )
    return null;
  return {
    type,
    notificationId: notification_id,
    conversationId: conversation_id,
    messageId: typeof message_id === "string" ? message_id : null,
  };
}

function extractData(notification: {
  request: { content: { data?: unknown } };
}): unknown {
  return notification.request.content.data;
}

/** Warm/background tap listener. Only fires for a payload that parses cleanly as PushTapHandoff. */
export function onNotificationResponse(
  listener: (handoff: PushTapHandoff) => void,
): Unsubscribe {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response: {
      notification: { request: { content: { data?: unknown } } };
    }) => {
      const handoff = parsePushTapHandoff(extractData(response.notification));
      if (handoff) listener(handoff);
    },
  );
  return () => subscription.remove();
}

/** Cold-start tap check; resolves `null` when there was no response or it doesn't parse. */
export async function getLastNotificationResponse(): Promise<PushTapHandoff | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  return parsePushTapHandoff(extractData(response.notification));
}

/** Foreground receipt listener (app open, no tap). Only fires for a parseable payload. */
export function onNotificationReceived(
  listener: (handoff: PushTapHandoff) => void,
): Unsubscribe {
  const subscription = Notifications.addNotificationReceivedListener(
    (notification: { request: { content: { data?: unknown } } }) => {
      const handoff = parsePushTapHandoff(extractData(notification));
      if (handoff) listener(handoff);
    },
  );
  return () => subscription.remove();
}

/** Idempotent Android notification channel setup; a no-op on other platforms. */
export async function ensureAndroidDefaultChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL_ID, {
    name: ANDROID_DEFAULT_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Registers the foreground presentation handler (banner + list, no sound/badge). */
export function configureForegroundPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}
