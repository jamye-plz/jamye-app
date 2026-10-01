import { Button, HStack, Host, ScrollView } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  defaultScrollAnchor,
  defaultScrollAnchorForRole,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { Platform } from "react-native";

import { selectionAsync } from "@/shared/platform/haptics";
import { supportsLiquidGlassButtons } from "@/shared/ui/standard-state-view.ios";

import { dialDates, topicDateLabel } from "../model/topics-dates";
import type { TopicDateChipsProps } from "./topic-date-chips.types";

export type * from "./topic-date-chips.types";

/**
 * iOS date dial (T1): a horizontal SwiftUI `ScrollView` of Liquid Glass
 * capsule `Button`s (`glassProminent` selected / `glass` otherwise, iOS 26+;
 * `borderedProminent`/`bordered` below that), trailing-anchored so the strip
 * opens on today/the current selection. Android resolves to
 * `topic-date-chips.android.tsx`.
 */
export function TopicDateChips({
  dates,
  onSelect,
  selected,
  testID,
  today,
}: TopicDateChipsProps) {
  const items = dialDates(dates, today, selected);
  const liquidGlass = supportsLiquidGlassButtons(Platform.Version);
  // Open on today (trailing) but keep a short strip leading-aligned like the
  // Android row; iOS 16.4-17 only has the combined anchor.
  const anchor =
    parseInt(String(Platform.Version), 10) >= 18
      ? [
          defaultScrollAnchorForRole("trailing", "initialOffset"),
          defaultScrollAnchorForRole("leading", "alignment"),
        ]
      : [defaultScrollAnchor("trailing")];
  // Vertical-only: the strip takes the row width and scrolls inside it
  // instead of growing to the full width of every chip.
  return (
    <Host matchContents={{ vertical: true }} testID={testID}>
      <ScrollView axes="horizontal" modifiers={anchor} showsIndicators={false}>
        <HStack modifiers={[padding({ horizontal: 16 })]} spacing={8}>
          {items.map((date) => {
            const isSelected = date === selected;
            return (
              <Button
                key={date}
                label={topicDateLabel(date, today)}
                modifiers={[
                  buttonStyle(
                    isSelected
                      ? liquidGlass
                        ? "glassProminent"
                        : "borderedProminent"
                      : liquidGlass
                        ? "glass"
                        : "bordered",
                  ),
                ]}
                onPress={() => {
                  if (!isSelected) {
                    void selectionAsync();
                    onSelect(date);
                  }
                }}
              />
            );
          })}
        </HStack>
      </ScrollView>
    </Host>
  );
}
