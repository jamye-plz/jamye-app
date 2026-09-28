import { useSession } from "@/core/providers/session-provider";
import { useAccountLifecycle } from "@/features/account/model/use-account-lifecycle";
import { NativeInputDialog } from "@/shared/ui/native-input-dialog";

import { useNicknameEditorState } from "./nickname-edit-screen.shared";

export type * from "./nickname-edit-screen.shared";

/**
 * A2/C3 (Android): nickname-change M3 full-screen dialog, rendered through
 * the round-1 `NativeInputDialog` shell. Mirrors `nickname-edit-screen.ios.tsx`.
 */
export function NicknameEditScreen() {
  const session = useSession();
  const accountLifecycle = useAccountLifecycle();
  const currentNickname = session.state.profile?.nickname ?? "";
  const editor = useNicknameEditorState(accountLifecycle, currentNickname);
  return (
    <NativeInputDialog
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
