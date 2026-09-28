import { useCallback, useRef, useState } from "react";
import { useRouter } from "expo-router";

import { NICKNAME_MAX_LENGTH } from "@/core/contracts/server";

import type { AccountLifecycle } from "../model/account-lifecycle";

const EMPTY_ERROR = "닉네임을 입력해 주세요.";
const TOO_LONG_ERROR = "닉네임은 64자 이하로 입력해 주세요.";
const GENERIC_ERROR =
  "닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
export const NICKNAME_HELPER_TEXT = "그룹에서 보이는 이름입니다.";

export type NicknameEditorState = Readonly<{
  value: string;
  busy: boolean;
  helperText: string;
  errorText: string | undefined;
  submitDisabled: boolean;
  onChangeValue: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}>;

/** Mirrors account-lifecycle.ts's own trim/length guard so an invalid draft
 * never reaches `updateNickname` -- this is a UI-side pre-check, not a
 * replacement for the lifecycle's own validation (ported from the
 * now-removed inline `nickname-section.tsx` field). */
function localValidationError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return EMPTY_ERROR;
  if (trimmed.length > NICKNAME_MAX_LENGTH) return TOO_LONG_ERROR;
  return null;
}

/**
 * A2/U2: the state machine behind both C3 shells
 * (`nickname-edit-screen.ios.tsx` via `NativeInputSheet`,
 * `nickname-edit-screen.android.tsx` via `NativeInputDialog`). On success
 * the shell closes (`router.back()`); the account screen picks up the new
 * nickname from `session.state.profile` (already published by
 * `account-lifecycle.ts`'s `applyProfile` call), so no extra plumbing is
 * needed here.
 */
export function useNicknameEditorState(
  accountLifecycle: AccountLifecycle | null,
  currentNickname: string,
): NicknameEditorState {
  const router = useRouter();
  const [value, setValue] = useState(currentNickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const validationError = localValidationError(value);
  const unchanged = value.trim() === currentNickname;

  const onChangeValue = useCallback((next: string) => {
    setValue(next);
    setError(null);
  }, []);

  const onCancel = useCallback(() => {
    if (pendingRef.current) return;
    router.back();
  }, [router]);

  const onSubmit = useCallback(() => {
    // Defense-in-depth: the shell already disables submit while
    // `submitDisabled` is true, but never call the lifecycle if it somehow
    // still fires (busy, unchanged, invalid, or no lifecycle yet).
    if (pendingRef.current || !accountLifecycle) return;
    if (validationError) {
      setError(validationError);
      return;
    }
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    void accountLifecycle
      .updateNickname(value)
      .then((result) => {
        pendingRef.current = false;
        setBusy(false);
        if (result.status === "ok") {
          router.back();
          return;
        }
        if (result.status === "invalid") {
          setError(result.reason === "empty" ? EMPTY_ERROR : TOO_LONG_ERROR);
          return;
        }
        setError(GENERIC_ERROR);
      })
      .catch(() => {
        pendingRef.current = false;
        setBusy(false);
        setError(GENERIC_ERROR);
      });
  }, [accountLifecycle, router, validationError, value]);

  return {
    busy,
    errorText: validationError ?? error ?? undefined,
    helperText: NICKNAME_HELPER_TEXT,
    onCancel,
    onChangeValue,
    onSubmit,
    submitDisabled:
      busy || unchanged || Boolean(validationError) || !accountLifecycle,
    value,
  };
}
