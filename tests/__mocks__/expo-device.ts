/**
 * jest manual mock for `expo-device`. This file lives under
 * `tests/__mocks__/expo-device.ts` (jest `roots` includes `tests/`, mirroring
 * how `tests/__mocks__/@expo/ui.tsx` is picked up automatically) so any
 * `import ... from "expo-device"` resolves here without an explicit
 * `jest.mock("expo-device")` call in the consuming test file.
 *
 * Only `isDevice` is consumed by
 * `src/features/notifications/platform/push-notifications-adapter.ts`, to
 * classify a `getExpoPushTokenAsync` failure on non-hardware environments
 * (simulator/emulator) as the `not_physical_device` diagnostic reason.
 * `export let` (rather than `export const`) is required so babel's
 * CommonJS-module transform re-exports the value on every reassignment,
 * letting `__setIsDevice` change what already-imported call sites observe.
 */
export let isDevice = true;

export function __setIsDevice(value: boolean): void {
  isDevice = value;
}

export function __resetExpoDeviceMock(): void {
  isDevice = true;
}
