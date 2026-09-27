import { useEffect } from "react";
import { BackHandler } from "react-native";

/**
 * Android: while `active`, the system back button or gesture runs `onBack`
 * instead of popping the screen. The topic edit screen is an M3 full-screen
 * dialog, and back dismisses the dialog rather than dropping the edit along
 * with the topic. iOS resolves to the no-op `use-close-edit-on-back.ts`.
 */
export function useCloseEditOnBack(active: boolean, onBack: () => void) {
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [active, onBack]);
}
