import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { NativeInputShellProps } from "@/shared/ui/native-input-shell.types";

/**
 * Test double for the C3 input shell (`NativeInputSheet` /
 * `NativeInputDialog`): the field, supporting text and both actions become
 * React Native elements so a screen test can drive the shell's prop contract.
 * F5/C18/GROUPS-AC8: mirrors the real shells' uncontrolled field exactly --
 * `native-input-sheet.ios.tsx` and `native-input-dialog.android.tsx` both
 * seed (and re-seed on change) an internal field from `initialValue` and
 * never read `value` for rendering. This mock does the same: `value` stays
 * in the prop contract (some callers still pass it) but is never read here.
 * The shell's own native rendering is covered by `native-input-shell.test.tsx`.
 *
 * react-hooks/set-state-in-effect: re-seeding used to run inside a
 * `useEffect`. Rather than comparing against a stored previous value during
 * render (a second useState call whose own conditional `setText` sits next
 * to typing's unconditional `setText`, which regressed the "typing updates
 * the field locally" case), this uses plain `key`-based remounting -- the
 * same technique `groups-provider.tsx`'s `GroupsProvider` already uses. A
 * changed (defined) `initialValue` gets a brand-new `Field` instance with a
 * fresh `useState` initializer; typing never touches this key (only
 * `initialValue` does), so it can never be reset by a same-key re-render.
 *
 * R6 (REFINE): the key tracks the *last defined* `initialValue`, not
 * `initialValue` itself. Both real shells' re-seed effects guard the same
 * way (`if (initialValue !== undefined) …set(initialValue)`), so a
 * transition from a string to `undefined` must not remount (and so not
 * clear) the field either. The key is state adjusted during render (React's
 * "storing information from previous renders" pattern), since a ref may not
 * be read or written during render (react-hooks/refs).
 */
export function NativeInputShellMock(props: NativeInputShellProps) {
  const [seedKey, setSeedKey] = useState(props.initialValue ?? "");
  if (props.initialValue !== undefined && props.initialValue !== seedKey)
    setSeedKey(props.initialValue);
  return <Field key={seedKey} {...props} />;
}

function Field({
  busy,
  errorText,
  helperText,
  initialValue,
  onCancel,
  onChangeValue,
  onSubmit,
  placeholder,
  submitDisabled,
  submitLabel,
  testID,
  title,
}: NativeInputShellProps) {
  const [text, setText] = useState(initialValue ?? "");
  const submitBlocked = Boolean(submitDisabled) || Boolean(busy);
  return (
    <View testID={testID}>
      <Text accessibilityRole="header">{title}</Text>
      <Pressable
        accessibilityLabel="취소"
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(busy) }}
        disabled={busy}
        onPress={onCancel}
      />
      <TextInput
        accessibilityHint={initialValue}
        accessibilityLabel={placeholder}
        editable={!busy}
        onChangeText={(next) => {
          setText(next);
          onChangeValue(next);
        }}
        value={text}
      />
      {(errorText ?? helperText) ? (
        <Text>{errorText ?? helperText}</Text>
      ) : null}
      <Pressable
        accessibilityLabel={submitLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitBlocked }}
        disabled={submitBlocked}
        onPress={onSubmit}
      />
    </View>
  );
}
