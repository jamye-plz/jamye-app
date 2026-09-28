/**
 * jest manual mock for `expo-clipboard`. This file lives under
 * `tests/__mocks__/expo-clipboard.ts` (jest `roots` includes `tests/`,
 * mirroring how `tests/__mocks__/@expo/ui.tsx` is picked up automatically)
 * so any `import ... from "expo-clipboard"` resolves here without an
 * explicit `jest.mock("expo-clipboard")` call in the consuming test file.
 *
 * Mirrors the subset used by R2 message copy (sanctioned under
 * `src/features/chat/platform/**`): `setStringAsync`, plus `getStringAsync`
 * / `hasStringAsync` for round-trip assertions. An in-memory string stands
 * in for the OS clipboard; `__set*`/`__reset*` helpers drive it from tests.
 */

let clipboardText = "";

export const setStringAsync = jest.fn(async (text: string) => {
  clipboardText = text;
  return true;
});

export const getStringAsync = jest.fn(async () => clipboardText);

export const hasStringAsync = jest.fn(async () => clipboardText.length > 0);

export function __setClipboardText(text: string): void {
  clipboardText = text;
}

export function __resetExpoClipboardMock(): void {
  clipboardText = "";
  setStringAsync.mockClear();
  getStringAsync.mockClear();
  hasStringAsync.mockClear();
}
