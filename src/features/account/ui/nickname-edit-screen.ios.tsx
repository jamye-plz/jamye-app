import { useSession } from "@/core/providers/session-provider";
import { useAccountLifecycle } from "@/features/account/model/use-account-lifecycle";
import { NativeInputSheet } from "@/shared/ui/native-input-sheet";

import { useNicknameEditorState } from "./nickname-edit-screen.shared";

export type * from "./nickname-edit-screen.shared";

/**
 * A2/C3 (iOS): nickname-change modal `Form` sheet, rendered through the
 * round-1 `NativeInputSheet` shell. Route: `src/app/account/nickname.tsx`
 * (declared as a root-Stack modal in `src/app/_layout.tsx`, title
 * "닉네임 변경"). Replaces the removed inline field in `nickname-section.tsx`.
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
