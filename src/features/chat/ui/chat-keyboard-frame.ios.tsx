import type { ReactNode } from "react";
import {
  KeyboardState,
  useAnimatedKeyboard,
} from "react-native-keyboard-controller";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type KeyboardStateValue = (typeof KeyboardState)[keyof typeof KeyboardState];

type ChatKeyboardFrameProps = Readonly<{
  children: (
    metrics: Readonly<{
      keyboardOverlap: SharedValue<number>;
      keyboardState: SharedValue<KeyboardStateValue>;
    }>,
  ) => ReactNode;
}>;

export function ChatKeyboardFrame({ children }: ChatKeyboardFrameProps) {
  const keyboard = useAnimatedKeyboard();
  const { bottom } = useSafeAreaInsets();
  const keyboardOverlap = useDerivedValue(() =>
    Math.max(0, keyboard.height.value - bottom),
  );
  const frameStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboardOverlap.value,
  }));

  return (
    <Animated.View style={[{ flex: 1 }, frameStyle]}>
      {children({ keyboardOverlap, keyboardState: keyboard.state })}
    </Animated.View>
  );
}
