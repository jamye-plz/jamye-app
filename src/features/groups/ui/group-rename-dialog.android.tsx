import { Host } from "@expo/ui";
import {
  AlertDialog,
  OutlinedTextField,
  Text,
  TextButton,
  useNativeState,
} from "@expo/ui/jetpack-compose";
import { useEffect } from "react";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

import type { GroupRenameDialogProps } from "./group-rename-dialog.types";

export type * from "./group-rename-dialog.types";

type NativeStringState = Readonly<{
  set: (value: string) => void;
}>;

/**
 * I3: re-seeds the native text field with the current name every time the
 * dialog opens; the native state otherwise keeps the last typed (possibly
 * cancelled) value from the previous presentation.
 *
 * R5 (REFINE): inlined from the former `group-rename-dialog.shared.ts` --
 * since U11 moved iOS's I3 rename to the `groups/[groupId]/rename` sheet,
 * this file is its only caller.
 */
function useResyncOnPresent(
  boundValue: NativeStringState,
  value: string,
  isPresented: boolean,
) {
  useEffect(() => {
    if (isPresented) boundValue.set(value);
  }, [boundValue, isPresented, value]);
}

/**
 * I3 on Android: Compose `AlertDialog` with an `OutlinedTextField` in the
 * text slot. `useNativeState` seeds the field with `currentName` and
 * re-syncs whenever the dialog re-opens (`useResyncOnPresent`).
 */
export function GroupRenameDialog({
  busy,
  currentName,
  isPresented,
  onCancel,
  onSubmit,
  testID,
}: GroupRenameDialogProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const name = useNativeState(currentName);
  useResyncOnPresent(name, currentName, isPresented);
  if (!isPresented) return null;
  return (
    <Host seedColor={hex.primary} testID={testID}>
      <AlertDialog onDismissRequest={onCancel}>
        {/* expo-ui `Text` applies its own default style over the dialog
            slots, so the M3 dialog type roles are set explicitly. */}
        <AlertDialog.Title>
          <Text style={{ typography: "headlineSmall" }}>그룹 이름 변경</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <OutlinedTextField enabled={!busy} value={name} />
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton onClick={onCancel}>
            <Text color={hex.primary} style={{ typography: "labelLarge" }}>
              취소
            </Text>
          </TextButton>
        </AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton>
          <TextButton enabled={!busy} onClick={() => onSubmit(name.get())}>
            <Text color={hex.primary} style={{ typography: "labelLarge" }}>
              저장
            </Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
      </AlertDialog>
    </Host>
  );
}
