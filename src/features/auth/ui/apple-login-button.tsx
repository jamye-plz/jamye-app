export type AppleLoginButtonProps = Readonly<{
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}>;

/**
 * Web/tsc fallback for the platform-resolved `./apple-login-button` import.
 * Sign in with Apple exists only on iOS (`apple-login-button.ios.tsx`); every
 * other platform renders nothing, like `apple-login-button.android.tsx`.
 */
export function AppleLoginButton(_props: AppleLoginButtonProps): null {
  return null;
}
