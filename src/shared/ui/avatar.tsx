import { Text, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { monogramLetter } from "@/shared/ui/avatar.shared";
import type { AvatarProps } from "@/shared/ui/avatar.types";

export type { AvatarProps } from "@/shared/ui/avatar.types";
export { monogramLetter };

/**
 * Web/default fallback. Neither platform's native image-loading path exists
 * here, so this always renders the neutral monogram circle (G1 group rows
 * call `Avatar` without a `uri` on every platform, so they always land here
 * on the monogram path even on iOS/Android).
 */
export function Avatar({ name, size, testID }: AvatarProps) {
  const theme = useAppTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.fill,
        borderRadius: size / 2,
        height: size,
        justifyContent: "center",
        width: size,
      }}
      testID={testID}
    >
      <Text
        style={{
          color: theme.colors.text,
          fontSize: size * 0.44,
          fontWeight: "600",
        }}
      >
        {monogramLetter(name)}
      </Text>
    </View>
  );
}
