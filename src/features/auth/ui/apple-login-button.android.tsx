export type AppleLoginButtonProps = Readonly<{
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}>;

/**
 * D16/U3: Sign in with Apple has no Android surface -- this component is
 * always `null`, matching `AppleAuthentication.isAvailableAsync()` always
 * resolving `false` on this platform (`apple-authentication-port.ts`'s
 * Android/default implementation). The Android login screen keeps its
 * existing two brand buttons and subtitle unchanged.
 */
export function AppleLoginButton(_props: AppleLoginButtonProps): null {
  return null;
}
