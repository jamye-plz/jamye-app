/**
 * I3: rename the group from a centered dialog with a text field. iOS
 * resolves to `group-rename-dialog.ios.tsx` (swift-ui `Alert` + `TextField`
 * inside `Alert.Actions` -- unverified on a real device, see that file's
 * doc comment), Android to `.android.tsx` (`AlertDialog` +
 * `OutlinedTextField`).
 */
export type GroupRenameDialogProps = Readonly<{
  isPresented: boolean;
  currentName: string;
  /** Disables the field and the save action while a rename is in flight. */
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
  testID?: string;
}>;
