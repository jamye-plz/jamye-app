import { useSession } from "@/core/providers/session-provider";
import { useAccountLifecycle } from "@/features/account/model/use-account-lifecycle";
import { NativeInputSheet } from "@/shared/ui/native-input-sheet";

import { useNicknameEditorState } from "./nickname-edit-screen.shared";

/**
 * A2/C3: fallback for platforms without a native modal-sheet affordance
 * (web). iOS resolves to `nickname-edit-screen.ios.tsx`, Android to
 * `nickname-edit-screen.android.tsx`.
 */
export function NicknameEditScreen() {
  const session = useSession();
  const accountLifecycle = useAccountLifecycle();
  const currentNickname = session.state.profile?.nickname ?? "";
  const editor = useNicknameEditorState(accountLifecycle, currentNickname);
  return (
    <NativeInputSheet
      autoFocus
      busy={editor.busy}
      errorText={editor.errorText}
      helperText={editor.helperText}
      initialValue={currentNickname}
      onCancel={editor.onCancel}
      onChangeValue={editor.onChangeValue}
      onSubmit={editor.onSubmit}
      placeholder="닉네임"
      submitDisabled={editor.submitDisabled}
      submitLabel="저장"
      testID="nickname-edit-screen"
      title="닉네임 변경"
      value={editor.value}
    />
  );
}
