import { Text } from "@expo/ui";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

/**
 * Material 3 list subheader for the Compose `List` screens (Android): muted
 * 14sp text on the list's 16dp inset, the same treatment as the group-detail
 * subheaders. iOS screens use SwiftUI `Section` titles instead.
 */
export function ListSubheader({
  children,
  testID,
}: Readonly<{ children: string; testID?: string }>) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  return (
    <Text
      style={{ paddingBottom: 8, paddingHorizontal: 16, paddingTop: 16 }}
      testID={testID}
      textStyle={{ color: hex.textMuted, fontSize: 14 }}
    >
      {children}
    </Text>
  );
}
