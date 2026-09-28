import * as Haptics from "expo-haptics";

type HapticsModule = typeof import("@/features/chat/platform/haptics.ios");

describe.each(["ios", "android"] as const)(
  "V3 chat-scoped haptics wrapper (%s)",
  (platform) => {
    const modulePath =
      platform === "ios"
        ? "../../../../src/features/chat/platform/haptics.ios"
        : "../../../../src/features/chat/platform/haptics.android";

    function load(): HapticsModule {
      return jest.requireActual<HapticsModule>(modulePath);
    }

    afterEach(() => {
      jest.clearAllMocks();
    });

    test(`${platform === "ios" ? "fires" : "never fires"} impact/notification feedback for record start/stop/send`, () => {
      const {
        hapticVoiceRecordingStarted,
        hapticVoiceRecordingStopped,
        hapticVoiceMessageSent,
      } = load();

      hapticVoiceRecordingStarted();
      hapticVoiceRecordingStopped();
      hapticVoiceMessageSent();

      if (platform === "ios") {
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
        expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
      } else {
        expect(Haptics.impactAsync).not.toHaveBeenCalled();
        expect(Haptics.notificationAsync).not.toHaveBeenCalled();
      }
    });
  },
);
