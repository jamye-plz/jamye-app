import {
  Alert,
  Button,
  Spacer,
  TextField,
  useNativeState,
} from "@expo/ui/swift-ui";
import { disabled } from "@expo/ui/swift-ui/modifiers";
import { Host } from "@expo/ui";

import { useResyncOnPresent } from "./group-rename-dialog.shared";
import type { GroupRenameDialogProps } from "./group-rename-dialog.types";

export type * from "./group-rename-dialog.types";

/**
 * I3 on iOS: SwiftUI `Alert` with a `TextField` inside `Alert.Actions` (the
 * platform's native "prompt" pattern). **Unverified on a real device** --
 * `@expo/ui`'s `Alert` slot API was built for button rows; whether a
 * `TextField` renders/behaves correctly inside `Alert.Actions` needs
 * `task-app-device` confirmation. If it does not work, fall back to the C3
 * `Form` sheet shell (`NativeInputSheet`) the way `group-form-screen.tsx`
 * uses it, and record that switch in evidence. `useNativeState` seeds the
 * field with `currentName` and is re-synced whenever the dialog re-opens
 * (`isPresented` transitions to true) so a second open always starts from
 * the latest name rather than the last edit. Validation (empty/length) is
 * left to the existing `renameGroup` mutation's outcome, consistent with
 * the kit's C3 shells (see `native-input-sheet.ios.tsx`'s decision notes).
 */
export function GroupRenameDialog({
  busy,
  currentName,
  isPresented,
  onCancel,
  onSubmit,
  testID,
}: GroupRenameDialogProps) {
  const name = useNativeState(currentName);
  useResyncOnPresent(name, currentName, isPresented);
  return (
    <Host testID={testID}>
      <Alert
        isPresented={isPresented}
        onIsPresentedChange={(presented) => {
          if (!presented) onCancel();
        }}
        title="그룹 이름 변경"
      >
        <Alert.Trigger>
          <Spacer />
        </Alert.Trigger>
        <Alert.Actions>
          <TextField
            modifiers={busy ? [disabled(true)] : undefined}
            placeholder="그룹 이름"
            text={name}
          />
          <Button label="취소" onPress={onCancel} role="cancel" />
          <Button
            label="저장"
            modifiers={busy ? [disabled(true)] : undefined}
            onPress={() => onSubmit(name.get())}
          />
        </Alert.Actions>
      </Alert>
    </Host>
  );
}
