/**
 * jest manual mock for `expo-apple-authentication`. This file lives under
 * `tests/__mocks__/expo-apple-authentication.ts` (jest `roots` includes
 * `tests/`, mirroring how `tests/__mocks__/@expo/ui.tsx` and
 * `tests/__mocks__/expo-haptics.ts` are picked up automatically) so any
 * `import ... from "expo-apple-authentication"` resolves here without an
 * explicit `jest.mock("expo-apple-authentication")` call in the consuming
 * test file.
 *
 * Only `apple-authentication-port.ios.ts` imports this package (common
 * rules: the import stays out of any file Android/web loads). The real
 * enums are re-exported as-is (plain numeric constants, matching the SDK);
 * `isAvailableAsync`/`signInAsync`/`formatFullName` are `jest.fn()` so tests
 * can control availability, the returned credential, and thrown errors
 * (`ERR_REQUEST_CANCELED` for a user cancel, matching the real SDK's coded
 * error) per case.
 */

export enum AppleAuthenticationScope {
  FULL_NAME = 0,
  EMAIL = 1,
}

export enum AppleAuthenticationButtonType {
  SIGN_IN = 0,
  CONTINUE = 1,
  SIGN_UP = 2,
}

export enum AppleAuthenticationButtonStyle {
  WHITE = 0,
  WHITE_OUTLINE = 1,
  BLACK = 2,
}

function defaultCredential() {
  return {
    authorizationCode: "mock-authorization-code",
    email: null,
    fullName: null,
    identityToken: "mock-identity-token",
    realUserStatus: 2,
    state: null,
    user: "mock-apple-user",
  };
}

export const isAvailableAsync = jest.fn(async () => true);

export const signInAsync = jest.fn(async () => defaultCredential());

export const formatFullName = jest.fn(
  (fullName: {
    familyName?: string | null;
    givenName?: string | null;
  }): string =>
    // Korean order (성+이름), matching U6's iOS-locale display expectation
    // for this mock's default fixtures; real formatting is delegated to the
    // native SDK in production.
    [fullName.familyName, fullName.givenName].filter(Boolean).join(""),
);

export function __resetExpoAppleAuthenticationMock(): void {
  isAvailableAsync.mockClear();
  isAvailableAsync.mockResolvedValue(true);
  signInAsync.mockClear();
  signInAsync.mockResolvedValue(defaultCredential());
  formatFullName.mockClear();
}
