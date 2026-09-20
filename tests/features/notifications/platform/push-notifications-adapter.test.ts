import { Platform } from "react-native";

// Imported by relative path (not the bare "expo-notifications"/"expo-device"
// specifiers) purely so `tsc` resolves these test-only control helpers
// against the manual mock's own types instead of the real native module's
// public types, which don't declare them. Jest's manual-mock resolution
// still redirects the adapter-under-test's own `from "expo-notifications"`/
// `from "expo-device"` imports to this exact same file (by absolute path),
// so both sides share one module instance/mock-fn state.
import {
  __emitNotificationReceived,
  __emitNotificationResponse,
  __emitPushToken,
  __resetExpoNotificationsMock,
  __setLastNotificationResponse,
  AndroidImportance,
  buildMockNotification,
  buildMockNotificationResponse,
  getExpoPushTokenAsync,
  getLastNotificationResponseAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from "../../../__mocks__/expo-notifications";
import {
  __resetExpoDeviceMock,
  __setIsDevice,
} from "../../../__mocks__/expo-device";

import {
  configureForegroundPresentation,
  ensureAndroidDefaultChannel,
  getExpoPushToken,
  getLastNotificationResponse,
  getPermissions,
  onNotificationReceived,
  onNotificationResponse,
  onTokenChanged,
  parsePushTapHandoff,
  requestPermissions,
} from "@/features/notifications/platform/push-notifications-adapter";

describe("push-notifications-adapter", () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    __resetExpoNotificationsMock();
    __resetExpoDeviceMock();
    Object.defineProperty(Platform, "OS", {
      value: originalPlatformOS,
      configurable: true,
    });
  });

  describe("permissions", () => {
    it("maps a granted response from getPermissionsAsync to 'granted'", async () => {
      __setLastNotificationResponse(null);
      (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: "granted",
        granted: true,
        canAskAgain: true,
        expires: "never",
      });
      await expect(getPermissions()).resolves.toBe("granted");
    });

    it("maps a denied response to 'denied'", async () => {
      (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: "denied",
        granted: false,
        canAskAgain: false,
        expires: "never",
      });
      await expect(getPermissions()).resolves.toBe("denied");
    });

    it("treats an askable denial (Android never-asked POST_NOTIFICATIONS) as 'undetermined' so the prompt is shown", async () => {
      (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: "denied",
        granted: false,
        canAskAgain: true,
        expires: "never",
      });
      await expect(getPermissions()).resolves.toBe("undetermined");
    });

    it("keeps an askable denial returned by requestPermissionsAsync as 'denied'", async () => {
      (requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: "denied",
        granted: false,
        canAskAgain: true,
        expires: "never",
      });
      await expect(requestPermissions()).resolves.toBe("denied");
    });

    it("maps an undetermined, non-denied response to 'undetermined'", async () => {
      (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: "undetermined",
        granted: false,
        canAskAgain: true,
        expires: "never",
      });
      await expect(getPermissions()).resolves.toBe("undetermined");
    });

    it("requestPermissions maps requestPermissionsAsync's result the same way", async () => {
      (requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: "granted",
        granted: true,
        canAskAgain: true,
        expires: "never",
      });
      await expect(requestPermissions()).resolves.toBe("granted");
      expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe("getExpoPushToken", () => {
    it("resolves ok:true with the token data on success", async () => {
      (getExpoPushTokenAsync as jest.Mock).mockResolvedValueOnce({
        type: "expo",
        data: "ExponentPushToken[abc]",
      });
      await expect(
        getExpoPushToken({ projectId: "project-1" }),
      ).resolves.toEqual({ ok: true, token: "ExponentPushToken[abc]" });
      expect(getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: "project-1",
      });
    });

    it("still attempts the token call on a non-physical device (soft reason)", async () => {
      __setIsDevice(false);
      (getExpoPushTokenAsync as jest.Mock).mockResolvedValueOnce({
        type: "expo",
        data: "ExponentPushToken[sim]",
      });
      await expect(
        getExpoPushToken({ projectId: "project-1" }),
      ).resolves.toEqual({ ok: true, token: "ExponentPushToken[sim]" });
    });

    it("classifies a thrown error as not_physical_device only when isDevice is false", async () => {
      __setIsDevice(false);
      (getExpoPushTokenAsync as jest.Mock).mockRejectedValueOnce(
        new Error("no push service"),
      );
      await expect(
        getExpoPushToken({ projectId: "project-1" }),
      ).resolves.toEqual({ ok: false, reason: "not_physical_device" });
    });

    it("rethrows a thrown error on a physical device (generic failure, not a diagnostic reason)", async () => {
      __setIsDevice(true);
      const error = new Error("network down");
      (getExpoPushTokenAsync as jest.Mock).mockRejectedValueOnce(error);
      await expect(getExpoPushToken({ projectId: "project-1" })).rejects.toBe(
        error,
      );
    });
  });

  describe("parsePushTapHandoff", () => {
    it("parses a well-formed PushTapHandoff payload", () => {
      expect(
        parsePushTapHandoff({
          type: "new_topic",
          notification_id: "11111111-1111-1111-1111-111111111111",
          conversation_id: "22222222-2222-2222-2222-222222222222",
          message_id: null,
        }),
      ).toEqual({
        type: "new_topic",
        notificationId: "11111111-1111-1111-1111-111111111111",
        conversationId: "22222222-2222-2222-2222-222222222222",
        messageId: null,
      });
    });

    it("carries a string message_id through when present", () => {
      expect(
        parsePushTapHandoff({
          type: "chat_unread",
          notification_id: "id",
          conversation_id: "conv",
          message_id: "msg",
        }),
      ).toEqual({
        type: "chat_unread",
        notificationId: "id",
        conversationId: "conv",
        messageId: "msg",
      });
    });

    it.each([
      [null],
      [undefined],
      ["a string"],
      [
        {
          type: "unsupported_type",
          notification_id: "id",
          conversation_id: "conv",
        },
      ],
      [{ type: "new_topic", conversation_id: "conv" }],
      [{ type: "new_topic", notification_id: "id" }],
      [
        {
          type: "new_topic",
          notification_id: "id",
          conversation_id: "conv",
          message_id: 123,
        },
      ],
    ])("returns null for a malformed payload %#", (data) => {
      expect(parsePushTapHandoff(data)).toBeNull();
    });
  });

  describe("onTokenChanged", () => {
    it("subscribes to addPushTokenListener and returns an unsubscribe", () => {
      const listener = jest.fn();
      const unsubscribe = onTokenChanged(listener);
      const event = { type: "ios", data: "raw-device-token" };
      __emitPushToken(event);
      expect(listener).toHaveBeenCalledWith(event);
      unsubscribe();
      __emitPushToken({ type: "ios", data: "after-unsubscribe" });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("forwards only well-formed ios/android device tokens", () => {
      const listener = jest.fn();
      onTokenChanged(listener);
      __emitPushToken(null);
      __emitPushToken({ type: "web", data: { endpoint: "x" } });
      __emitPushToken({ type: "android", data: "" });
      __emitPushToken("ExponentPushToken[not-an-event]");
      expect(listener).not.toHaveBeenCalled();
      __emitPushToken({ type: "android", data: "fcm-token" });
      expect(listener).toHaveBeenCalledWith({
        data: "fcm-token",
        type: "android",
      });
    });
  });

  describe("getExpoPushToken with a forwarded device token", () => {
    it("passes the device token through so Expo does not re-query the platform", async () => {
      (getExpoPushTokenAsync as jest.Mock).mockResolvedValueOnce({
        type: "expo",
        data: "ExponentPushToken[from-event]",
      });
      await expect(
        getExpoPushToken({
          devicePushToken: { data: "fcm-token", type: "android" },
          projectId: "project-1",
        }),
      ).resolves.toEqual({ ok: true, token: "ExponentPushToken[from-event]" });
      expect(getExpoPushTokenAsync).toHaveBeenCalledWith({
        devicePushToken: { data: "fcm-token", type: "android" },
        projectId: "project-1",
      });
    });
  });

  describe("onNotificationResponse (tap)", () => {
    it("parses the tapped notification's data and delivers a PushTapHandoff", () => {
      const listener = jest.fn();
      const unsubscribe = onNotificationResponse(listener);
      __emitNotificationResponse(
        buildMockNotificationResponse({
          type: "chat_unread",
          notification_id: "n1",
          conversation_id: "c1",
          message_id: "m1",
        }),
      );
      expect(listener).toHaveBeenCalledWith({
        type: "chat_unread",
        notificationId: "n1",
        conversationId: "c1",
        messageId: "m1",
      });
      unsubscribe();
      listener.mockClear();
      __emitNotificationResponse(
        buildMockNotificationResponse({
          type: "chat_unread",
          notification_id: "n2",
          conversation_id: "c2",
          message_id: null,
        }),
      );
      expect(listener).not.toHaveBeenCalled();
    });

    it("ignores a malformed data payload without crashing", () => {
      const listener = jest.fn();
      onNotificationResponse(listener);
      expect(() =>
        __emitNotificationResponse(
          buildMockNotificationResponse({ garbage: true }),
        ),
      ).not.toThrow();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("getLastNotificationResponse (cold start)", () => {
    it("returns null when no response was received yet", async () => {
      __setLastNotificationResponse(null);
      await expect(getLastNotificationResponse()).resolves.toBeNull();
    });

    it("parses the last response's data when present", async () => {
      __setLastNotificationResponse(
        buildMockNotificationResponse({
          type: "other",
          notification_id: "n3",
          conversation_id: "c3",
          message_id: null,
        }),
      );
      await expect(getLastNotificationResponse()).resolves.toEqual({
        type: "other",
        notificationId: "n3",
        conversationId: "c3",
        messageId: null,
      });
      expect(getLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
    });

    it("returns null when the last response's data is malformed", async () => {
      __setLastNotificationResponse(
        buildMockNotificationResponse({ nope: true }),
      );
      await expect(getLastNotificationResponse()).resolves.toBeNull();
    });
  });

  describe("onNotificationReceived (foreground)", () => {
    it("parses a foreground-received notification's data and delivers a PushTapHandoff", () => {
      const listener = jest.fn();
      const unsubscribe = onNotificationReceived(listener);
      __emitNotificationReceived(
        buildMockNotification({
          type: "new_topic",
          notification_id: "n4",
          conversation_id: "c4",
          message_id: null,
        }),
      );
      expect(listener).toHaveBeenCalledWith({
        type: "new_topic",
        notificationId: "n4",
        conversationId: "c4",
        messageId: null,
      });
      unsubscribe();
    });

    it("ignores a malformed foreground payload without crashing", () => {
      const listener = jest.fn();
      onNotificationReceived(listener);
      expect(() =>
        __emitNotificationReceived(buildMockNotification({ bad: true })),
      ).not.toThrow();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("ensureAndroidDefaultChannel", () => {
    it("sets up the default channel on android", async () => {
      Object.defineProperty(Platform, "OS", {
        value: "android",
        configurable: true,
      });
      await ensureAndroidDefaultChannel();
      expect(setNotificationChannelAsync).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({ importance: AndroidImportance.DEFAULT }),
      );
    });

    it("is a no-op on ios", async () => {
      Object.defineProperty(Platform, "OS", {
        value: "ios",
        configurable: true,
      });
      await ensureAndroidDefaultChannel();
      expect(setNotificationChannelAsync).not.toHaveBeenCalled();
    });
  });

  describe("configureForegroundPresentation", () => {
    it("registers a foreground presentation handler", () => {
      configureForegroundPresentation();
      expect(setNotificationHandler).toHaveBeenCalledWith(
        expect.objectContaining({ handleNotification: expect.any(Function) }),
      );
    });
  });

  // Sole-importer boundary ("push-notifications-adapter.ts is the only file
  // in the feature importing expo-notifications or expo-device") is
  // verified by a manual grep over src/features/notifications rather than a
  // filesystem-walk assertion here: this project's strict tsconfig scopes
  // `types` to `["jest"]` only, so Node globals (fs/path/__dirname) aren't
  // typed for a `bun run typecheck` pass without pulling @types/node in
  // project-wide. `grep -rl 'from "expo-notifications"\|from "expo-device"'
  // src/features/notifications` returns only this file's implementation
  // module (recorded as evidence in result-mobile-A2).
});
