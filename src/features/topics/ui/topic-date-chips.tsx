import { Pressable, ScrollView, StyleSheet } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";

import { dialDates, topicDateLabel } from "../model/topics-dates";
import type { TopicDateChipsProps } from "./topic-date-chips.types";

export type * from "./topic-date-chips.types";

/**
 * Fallback for platforms without a native capsule-chip affordance (web): a
 * plain horizontal `ScrollView` of `Pressable` pills, oldest on the left,
 * today on the right (T1). iOS resolves to `topic-date-chips.ios.tsx`
 * (Liquid Glass capsules), Android to `topic-date-chips.android.tsx` (the
 * `jamye-ui` native `JamyeDateChipRowView`).
 */
export function TopicDateChips({
  dates,
  onSelect,
  selected,
  testID,
  today,
}: TopicDateChipsProps) {
  const { colors } = useAppTheme();
  const items = dialDates(dates, today, selected);
  return (
    <ScrollView
      accessibilityLabel="주제 날짜 선택"
      contentContainerStyle={styles.row}
      horizontal
      showsHorizontalScrollIndicator={false}
      testID={testID}
    >
      {items.map((date) => {
        const isSelected = date === selected;
        return (
          <Pressable
            accessibilityLabel={`${topicDateLabel(date, today)} 선택`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={date}
            onPress={() => {
              if (!isSelected) onSelect(date);
            }}
            style={[
              styles.pill,
              {
                backgroundColor: isSelected ? colors.primary : colors.fill,
              },
            ]}
          >
            <AppText
              color={isSelected ? colors.onPrimary : colors.textMuted}
              variant="label"
            >
              {topicDateLabel(date, today)}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: appSpacing.sm,
  },
  row: { gap: appSpacing.xs, paddingHorizontal: appSpacing.md },
});
