import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import type { GroupRenameDialogProps } from "./group-rename-dialog.types";

export type * from "./group-rename-dialog.types";

/**
 * Fallback for platforms without a native alert-with-textfield affordance
 * (web). iOS/Android resolve to their own files.
 */
export function GroupRenameDialog({
  busy,
  currentName,
  isPresented,
  onCancel,
  onSubmit,
  testID,
}: GroupRenameDialogProps) {
  const [name, setName] = useState(currentName);
  if (!isPresented) return null;
  return (
    <Modal testID={testID} transparent visible={isPresented}>
      <View>
        <Text accessibilityRole="header">그룹 이름 변경</Text>
        <TextInput editable={!busy} onChangeText={setName} value={name} />
        <Pressable accessibilityRole="button" onPress={onCancel}>
          <Text>취소</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(busy) }}
          disabled={busy}
          onPress={() => onSubmit(name)}
        >
          <Text>저장</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
