import { Host } from "@expo/ui";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";
import { JamyeDateChipRowNativeView } from "@/shared/ui/jamye-ui-native";

import { dialDates, topicDateLabel } from "../model/topics-dates";
import type { TopicDateChipsProps } from "./topic-date-chips.types";

export type * from "./topic-date-chips.types";

/**
 * Android date dial (T1): the local `jamye-ui` Expo module's
 * `JamyeDateChipRowView` -- a reverse-layout Compose `LazyRow` of M3
 * `FilterChip`s (expo-ui 57's `LazyRow` has no `reverseLayout`/initial-index
 * support, hence the dedicated native view). iOS resolves to
 * `topic-date-chips.ios.tsx`.
 */
export function TopicDateChips({
  dates,
  onSelect,
  selected,
  testID,
  today,
}: TopicDateChipsProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  if (!JamyeDateChipRowNativeView) return null;
  const items = dialDates(dates, today, selected).map((date) => ({
    key: date,
    label: topicDateLabel(date, today),
  }));
  // Vertical-only: a horizontal match would measure the `LazyRow` with an
  // unbounded width, which Compose rejects (IllegalStateException).
  return (
    <Host matchContents={{ vertical: true }} testID={testID}>
      <JamyeDateChipRowNativeView
        accentColorHex={hex.primary}
        items={items}
        onDateSelect={(event) => onSelect(event.nativeEvent.key)}
        selectedKey={selected}
        surfaceColorHex={hex.surface}
        testID={testID}
      />
    </Host>
  );
}
