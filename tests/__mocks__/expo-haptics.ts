/**
 * jest manual mock for `expo-haptics`. This file lives under
 * `tests/__mocks__/expo-haptics.ts` (jest `roots` includes `tests/`,
 * mirroring how `tests/__mocks__/@expo/ui.tsx` is picked up automatically)
 * so any `import ... from "expo-haptics"` resolves here without an explicit
 * `jest.mock("expo-haptics")` call in the consuming test file.
 *
 * V3: expo-haptics is only called on iOS (record start/stop/send in the
 * voice composer, sanctioned under `src/features/chat/platform/**`) — never
 * on Android. The real enums are re-exported as-is (plain string/number
 * constants); only the three feedback functions are `jest.fn()`.
 */

export enum NotificationFeedbackType {
  Success = "success",
  Warning = "warning",
  Error = "error",
}

export enum ImpactFeedbackStyle {
  Light = "light",
  Medium = "medium",
  Heavy = "heavy",
  Soft = "soft",
  Rigid = "rigid",
}

export enum AndroidHaptics {
  Confirm = "confirm",
  Reject = "reject",
  Gesture_Start = "gesture-start",
  Gesture_End = "gesture-end",
  Toggle_On = "toggle-on",
  Toggle_Off = "toggle-off",
  Clock_Tick = "clock-tick",
  Context_Click = "context-click",
  Drag_Start = "drag-start",
  Keyboard_Tap = "keyboard-tap",
  Keyboard_Press = "keyboard-press",
  Keyboard_Release = "keyboard-release",
  Long_Press = "long-press",
  Virtual_Key = "virtual-key",
  Virtual_Key_Release = "virtual-key-release",
  No_Haptics = "no-haptics",
  Segment_Tick = "segment-tick",
  Segment_Frequent_Tick = "segment-frequent-tick",
  Text_Handle_Move = "text-handle-move",
}

export const notificationAsync = jest.fn(async () => undefined);
export const impactAsync = jest.fn(async () => undefined);
export const selectionAsync = jest.fn(async () => undefined);
export const performAndroidHapticsAsync = jest.fn(async () => undefined);

export function __resetExpoHapticsMock(): void {
  notificationAsync.mockClear();
  impactAsync.mockClear();
  selectionAsync.mockClear();
  performAndroidHapticsAsync.mockClear();
}
