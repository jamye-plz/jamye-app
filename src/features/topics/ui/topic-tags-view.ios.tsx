import { StyleSheet, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";

import type { TopicTagsViewProps } from "./topic-tags-view.types";

export type * from "./topic-tags-view.types";

/**
 * iOS tag view (D3): horizontal capsule labels, wrapping onto further rows
 * once they no longer fit one line. Android resolves to
 * `topic-tags-view.android.tsx` (`FlowRow` + `SuggestionChip`).
 */
export function TopicTagsView({ tags, testID }: TopicTagsViewProps) {
  const { colors } = useAppTheme();
  if (!tags.length)
    return (
      <AppText
        color={colors.textMuted}
        style={styles.empty}
        testID={testID}
        variant="footnote"
      >
        태그 없음
      </AppText>
    );
  return (
    <View style={styles.row} testID={testID}>
      {tags.map((tag) => (
        <View
          key={tag.tag}
          style={[styles.chip, { backgroundColor: colors.fill }]}
        >
          <AppText variant="caption">{`#${tag.tag}`}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: appSpacing.md, paddingVertical: appSpacing.sm },
  chip: {
    borderCurve: "continuous",
    borderRadius: 999,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: appSpacing.sm,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appSpacing.xs,
    padding: appSpacing.md,
  },
});
