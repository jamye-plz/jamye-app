/**
 * I3: rename the group from a centered dialog with a text field. Android
 * resolves to `.android.tsx` (`AlertDialog` + `OutlinedTextField`). iOS
 * renames through the `groups/[groupId]/rename` sheet instead
 * (`group-rename-screen.tsx`, M17/U11), so it has no platform file here.
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
