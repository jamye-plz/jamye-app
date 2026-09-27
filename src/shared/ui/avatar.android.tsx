import { useState } from "react";
import { Text, View } from "react-native";
import { Host } from "@expo/ui";
import { Image } from "@expo/ui/jetpack-compose";
import { size as sizeModifier } from "@expo/ui/jetpack-compose/modifiers";

import { useAppTheme } from "@/core/theme/theme-provider";
import { avatarImageUri, monogramLetter } from "@/shared/ui/avatar.shared";
import type { AvatarProps } from "@/shared/ui/avatar.types";

export type { AvatarProps } from "@/shared/ui/avatar.types";

/**
 * Android: `@expo/ui/jetpack-compose`'s `Image` (async + cached, T3) layered
 * over the monogram placeholder, which stays mounted underneath so it is
 * visible while the image loads and reappears if it fails (`onError`). No
 * jamye-ui native view is needed here -- the universal/platform layer
 * already covers this per the component-selection order.
 */
export function Avatar({ uri, name, size, testID }: AvatarProps) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const imageUri = failed ? undefined : avatarImageUri(uri);

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
        overflow: "hidden",
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
      {imageUri !== undefined ? (
        <View
          style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
        >
          <Host style={{ height: size, width: size }}>
            <Image
              contentDescription={null}
              contentScale="crop"
              modifiers={[sizeModifier(size, size)]}
              onError={() => setFailed(true)}
              source={{ uri: imageUri }}
            />
          </Host>
        </View>
      ) : null}
    </View>
  );
}
