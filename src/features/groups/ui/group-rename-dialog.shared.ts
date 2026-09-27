import { useEffect } from "react";

type NativeStringState = Readonly<{
  set: (value: string) => void;
}>;

/**
 * I3: re-seeds the native text field with the current name every time the
 * dialog opens; the native state otherwise keeps the last typed (possibly
 * cancelled) value from the previous presentation.
 */
export function useResyncOnPresent(
  boundValue: NativeStringState,
  value: string,
  isPresented: boolean,
) {
  useEffect(() => {
    if (isPresented) boundValue.set(value);
  }, [boundValue, isPresented, value]);
}
