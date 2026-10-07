/**
 * A1-A4/U7: copy and helpers shared verbatim by `account-screen.tsx`,
 * `account-screen.ios.tsx`, and `account-screen.android.tsx` (previously
 * triplicated identically in each file -- REFINE reusability MEDIUM /
 * consistency LOW). Mirrors the repo's existing shared-constants-file
 * precedent (`brand-login-button.constants.ts`). Every string and function
 * output is unchanged from the pre-extraction triplicated versions.
 */

export const STORAGE_ERROR_TEXT =
  "로컬 계정 저장소를 열 수 없습니다. 다시 시도해 주세요.";
export const DELETE_CONFIRM_TITLE = "계정 삭제";
export const DELETE_CONFIRM_MESSAGE =
  "계정을 삭제할까요? 30일 안에 같은 계정으로 다시 로그인하면 복구할 수 있고, 30일이 지나면 되돌릴 수 없습니다.";
// U7: Apple accounts see the base E9 copy plus a one-more-Apple-prompt
// notice (Android can only reach this defensively -- D16: no Apple login on
// Android -- but the copy still names the extra step accurately if it ever
// does). The reauthentication/proof/delete call itself stays inside
// use-delete-account-flow.ts (task-app-contract, r2-1 -- not touched here).
export const APPLE_REAUTH_NOTICE =
  "삭제하려면 Apple 인증을 한 번 더 진행합니다.";
export const LOGOUT_CONFIRM_TITLE = "로그아웃할까요?";
// Generic alert button labels (retry / close / acknowledge), shared by the
// account screens' alerts such as the profile-photo failure alert.
export const RETRY_LABEL = "다시 시도";
export const CLOSE_LABEL = "닫기";
export const ACKNOWLEDGE_LABEL = "확인";
export const PROVIDER_LABELS: Record<string, string> = {
  apple: "Apple",
  google: "Google",
  kakao: "카카오",
};

export function providerLoginLabel(provider: string): string {
  return `${PROVIDER_LABELS[provider] ?? provider} 계정으로 로그인됨`;
}

export function deleteConfirmMessage(provider: string): string {
  return provider === "apple"
    ? `${DELETE_CONFIRM_MESSAGE} ${APPLE_REAUTH_NOTICE}`
    : DELETE_CONFIRM_MESSAGE;
}
