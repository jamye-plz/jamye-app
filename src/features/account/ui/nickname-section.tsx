import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { NICKNAME_MAX_LENGTH } from "@/core/contracts/server";
import { useSession } from "@/core/providers/session-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { FormField } from "@/shared/ui/form-field";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";

import type { AccountLifecycle } from "../model/account-lifecycle";

const EMPTY_ERROR = "닉네임을 입력해 주세요.";
const TOO_LONG_ERROR = "닉네임은 64자 이하로 입력해 주세요.";
const GENERIC_ERROR =
  "닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const SUCCESS_MESSAGE = "닉네임을 저장했습니다.";

type NicknameSectionProps = Readonly<{
  accountLifecycle: AccountLifecycle;
}>;

/** Mirrors account-lifecycle.ts's own trim/length guard so an invalid draft
 * never reaches `updateNickname` -- this is a UI-side pre-check, not a
 * replacement for the lifecycle's own validation. */
function localValidationError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return EMPTY_ERROR;
  if (trimmed.length > NICKNAME_MAX_LENGTH) return TOO_LONG_ERROR;
  return null;
}

export function NicknameSection({ accountLifecycle }: NicknameSectionProps) {
  const session = useSession();
  const provider = session.state.profile?.provider ?? null;
  const currentNickname = session.state.profile?.nickname ?? "";
  const [draft, setDraft] = useState(currentNickname);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // The saved nickname is always sourced from session.state.profile
  // (published by account-lifecycle's applyProfile on success), never held
  // as a separate "last saved" local copy. Re-derive during render (the
  // React-recommended "adjusting state when a prop changes" pattern) rather
  // than in an effect, so an external profile change re-syncs the draft
  // without an extra render pass.
  const [syncedNickname, setSyncedNickname] = useState(currentNickname);
  if (currentNickname !== syncedNickname) {
    setSyncedNickname(currentNickname);
    setDraft(currentNickname);
  }

  const validationError = localValidationError(draft);
  const unchanged = draft.trim() === currentNickname;
  const invalid = validationError !== null;
  const displayedError = validationError ?? error;

  function handleChangeText(text: string): void {
    setDraft(text);
    setError(null);
    setSuccess(false);
  }

  function handleSave(): void {
    // Defense-in-depth: the button is already disabled while `invalid` is
    // true, but never call the lifecycle if this somehow still fires.
    if (validationError) return;
    setError(null);
    setSuccess(false);
    setPending(true);
    void accountLifecycle
      .updateNickname(draft)
      .then((result) => {
        setPending(false);
        if (result.status === "ok") {
          setSuccess(true);
          return;
        }
        if (result.status === "invalid") {
          setError(result.reason === "empty" ? EMPTY_ERROR : TOO_LONG_ERROR);
          return;
        }
        setError(GENERIC_ERROR);
      })
      .catch(() => {
        // The lifecycle resolves to a result object by contract; if that
        // contract is ever broken the field must still leave the busy state.
        setPending(false);
        setError(GENERIC_ERROR);
      });
  }

  return (
    <GroupedSection title="프로필">
      {provider ? (
        <GroupedRow
          leading={<AppSymbol name="account" />}
          title={`${provider} 계정으로 로그인됨`}
        />
      ) : null}
      <View style={styles.container}>
        <FormField
          autoCapitalize="none"
          editable={!pending}
          label="닉네임"
          onChangeText={handleChangeText}
          value={draft}
        />
        {displayedError ? (
          <InlineMessage kind="error" message={displayedError} />
        ) : null}
        {success ? <InlineMessage message={SUCCESS_MESSAGE} /> : null}
        <NativeButton
          busy={pending}
          disabled={pending || invalid || unchanged}
          label="닉네임 저장"
          onPress={handleSave}
        />
      </View>
    </GroupedSection>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: appSpacing.sm,
    paddingHorizontal: appSpacing.md,
    paddingVertical: appSpacing.sm,
  },
});
