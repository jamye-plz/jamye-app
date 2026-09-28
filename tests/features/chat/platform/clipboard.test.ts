import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { copyMessageBodyToClipboard } from "@/features/chat/platform/clipboard";

afterEach(() => {
  jest.clearAllMocks();
});

// `process.env.EXPO_OS` is inlined at transform time by the jest-expo
// preset (always "ios" under jest -- see common-rules), so only the iOS
// branch of `copyMessageBodyToClipboard`'s internal OS guard is reachable
// here. The Android no-haptics branch is a plain, unconditional `if` guard
// reviewable by inspection; there is no `.android.ts` file to
// `jest.requireActual` for a conditional inside a single shared module.
describe("copyMessageBodyToClipboard (R2)", () => {
  test("writes the message body to the clipboard", async () => {
    await copyMessageBodyToClipboard("복사할 메시지");

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("복사할 메시지");
  });

  test("fires an iOS success haptic", async () => {
    await copyMessageBodyToClipboard("본문");

    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });
});
