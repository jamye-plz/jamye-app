/**
 * jest manual mock for `expo-notifications`. This file lives under
 * `tests/__mocks__/expo-notifications.ts` (jest `roots` includes `tests/`,
 * mirroring how `tests/__mocks__/@expo/ui.tsx` is picked up automatically) so
 * any `import ... from "expo-notifications"` resolves here without an
 * explicit `jest.mock("expo-notifications")` call in the consuming test
 * file.
 *
 * Mirrors the subset of the native module's surface that
 * `src/features/notifications/platform/push-notifications-adapter.ts` (the
 * sole importer of this module under `src/features/notifications/`) calls,
 * plus `__emit*`/`__set*` test helpers for driving listener callbacks and
 * async resolution without touching real native code.
 */

export type MockNotificationPermissionsStatus = {
  status: "granted" | "denied" | "undetermined";
  granted: boolean;
  canAskAgain: boolean;
  expires: "never";
};

export type MockSubscription = { remove: () => void };

export const AndroidImportance = Object.freeze({
  UNKNOWN: 0,
  UNSPECIFIED: 1,
  NONE: 2,
  MIN: 3,
  LOW: 4,
  DEFAULT: 5,
  HIGH: 6,
  MAX: 7,
});

const UNDETERMINED_PERMISSIONS: MockNotificationPermissionsStatus = {
  status: "undetermined",
  granted: false,
  canAskAgain: true,
  expires: "never",
};
const GRANTED_PERMISSIONS: MockNotificationPermissionsStatus = {
  status: "granted",
  granted: true,
  canAskAgain: true,
  expires: "never",
};

let permissionsResult: MockNotificationPermissionsStatus = {
  ...UNDETERMINED_PERMISSIONS,
};
let requestResult: MockNotificationPermissionsStatus = {
  ...GRANTED_PERMISSIONS,
};
let lastNotificationResponse: unknown = null;

const tokenListeners = new Set<(event: unknown) => void>();
const responseListeners = new Set<(event: unknown) => void>();
const receivedListeners = new Set<(event: unknown) => void>();

export const setNotificationHandler = jest.fn();
export const setNotificationChannelAsync = jest.fn(async () => null);
export const getPermissionsAsync = jest.fn(async () => permissionsResult);
export const requestPermissionsAsync = jest.fn(async () => requestResult);
export const getExpoPushTokenAsync = jest.fn(async () => ({
  type: "expo" as const,
  data: "ExponentPushToken[mock-token]",
}));
export const getLastNotificationResponseAsync = jest.fn(
  async () => lastNotificationResponse,
);

export function addPushTokenListener(
  listener: (event: unknown) => void,
): MockSubscription {
  tokenListeners.add(listener);
  return { remove: () => tokenListeners.delete(listener) };
}

export function addNotificationResponseReceivedListener(
  listener: (event: unknown) => void,
): MockSubscription {
  responseListeners.add(listener);
  return { remove: () => responseListeners.delete(listener) };
}

export function addNotificationReceivedListener(
  listener: (event: unknown) => void,
): MockSubscription {
  receivedListeners.add(listener);
  return { remove: () => receivedListeners.delete(listener) };
}

/** Builds a fake `Notification` shaped like the real SDK's, for received/tap fixtures. */
export function buildMockNotification(data: unknown) {
  return {
    date: Date.now(),
    request: {
      identifier: "mock-notification-id",
      content: {
        title: null,
        subtitle: null,
        body: null,
        data,
      },
      trigger: { type: "push" },
    },
  };
}

/** Builds a fake `NotificationResponse` (tap event) wrapping `buildMockNotification`. */
export function buildMockNotificationResponse(data: unknown) {
  return {
    notification: buildMockNotification(data),
    actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
  };
}

export function __setPermissionsResult(
  result: MockNotificationPermissionsStatus,
): void {
  permissionsResult = result;
}
export function __setRequestPermissionsResult(
  result: MockNotificationPermissionsStatus,
): void {
  requestResult = result;
}
export function __setLastNotificationResponse(response: unknown): void {
  lastNotificationResponse = response;
}
export function __emitPushToken(event: unknown): void {
  tokenListeners.forEach((listener) => listener(event));
}
export function __emitNotificationResponse(event: unknown): void {
  responseListeners.forEach((listener) => listener(event));
}
export function __emitNotificationReceived(event: unknown): void {
  receivedListeners.forEach((listener) => listener(event));
}
export function __resetExpoNotificationsMock(): void {
  permissionsResult = { ...UNDETERMINED_PERMISSIONS };
  requestResult = { ...GRANTED_PERMISSIONS };
  lastNotificationResponse = null;
  tokenListeners.clear();
  responseListeners.clear();
  receivedListeners.clear();
  setNotificationHandler.mockClear();
  setNotificationChannelAsync.mockClear();
  getPermissionsAsync.mockClear();
  requestPermissionsAsync.mockClear();
  getExpoPushTokenAsync.mockClear();
  getLastNotificationResponseAsync.mockClear();
}
