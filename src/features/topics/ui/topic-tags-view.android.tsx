import { Host } from "@expo/ui";
import { FlowRow, SuggestionChip, Text } from "@expo/ui/jetpack-compose";
import { padding } from "@expo/ui/jetpack-compose/modifiers";
import { StyleSheet } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors, appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";

import type { TopicTagsViewProps } from "./topic-tags-view.types";

export type * from "./topic-tags-view.types";

/**
 * Android tag view (D3): a Compose `FlowRow` of `SuggestionChip`s, one per
 * tag (read-only -- no `onClick`, unlike D2's editable `InputChip`s in
 * `topic-edit-form.android.tsx`). iOS resolves to `topic-tags-view.ios.tsx`.
 */
export function TopicTagsView({ tags, testID }: TopicTagsViewProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  if (!tags.length)
    return (
      <AppText
        color={hex.textMuted}
        style={styles.empty}
        testID={testID}
        variant="footnote"
      >
        태그 없음
      </AppText>
    );
  // Vertical-only so `FlowRow` wraps at the row width instead of laying
  // every chip out on one unbounded line.
  return (
    <Host
      matchContents={{ vertical: true }}
      seedColor={hex.primary}
      testID={testID}
    >
      <FlowRow
        horizontalArrangement={{ spacedBy: 8 }}
        modifiers={[padding(16, 8, 16, 8)]}
      >
        {tags.map((tag) => (
          <SuggestionChip key={tag.tag}>
            <SuggestionChip.Label>
              <Text color={hex.text}>{`#${tag.tag}`}</Text>
            </SuggestionChip.Label>
          </SuggestionChip>
        ))}
      </FlowRow>
    </Host>
  );
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: appSpacing.md, paddingVertical: appSpacing.sm },
});
