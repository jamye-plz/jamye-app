import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from "react-native";
import { Animated, Pressable, StyleSheet } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";

import { dialDates, topicDateLabel } from "../model/topics-dates";

export const DATE_DIAL_ITEM_WIDTH = 112;
const DATE_PILL_HEIGHT = 36;
const FADE_RANGE = 3;

/**
 * Center-locked horizontal date dial: swipe to browse, then either let the
 * strip settle on a date or tap a visible one. Swipes commit only once the
 * strip settles, so dragging across several dates loads topics once; a tap
 * commits immediately and the strip animates it under the pill. The strip
 * holds at most a month of dates, so it is a plain ScrollView rather than a
 * virtualized list.
 */
export function TopicDateDial({
  dates,
  onSelect,
  selected,
  today,
}: Readonly<{
  dates: readonly string[];
  onSelect: (date: string) => void;
  selected: string;
  today: string;
}>) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);
  const [scrollX] = useState(() => new Animated.Value(0));
  const items = useMemo(
    () => dialDates(dates, today, selected),
    [dates, today, selected],
  );
  const selectedIndex = Math.max(0, items.indexOf(selected));
  const stripRef = useRef<ScrollView>(null);
  const settledRef = useRef(false);
  const side = Math.max(0, (width - DATE_DIAL_ITEM_WIDTH) / 2);

  const scrollToSelected = useCallback(
    (animated: boolean) =>
      stripRef.current?.scrollTo({
        animated,
        x: selectedIndex * DATE_DIAL_ITEM_WIDTH,
      }),
    [selectedIndex],
  );

  useEffect(() => {
    scrollToSelected(settledRef.current);
    settledRef.current = width > 0;
  }, [scrollToSelected, width, items.length]);

  const commit = (offsetX: number) => {
    const index = Math.min(
      items.length - 1,
      Math.max(0, Math.round(offsetX / DATE_DIAL_ITEM_WIDTH)),
    );
    const date = items[index];
    if (date && date !== selected) onSelect(date);
  };
  const step = (delta: number) => {
    const date = items[selectedIndex + delta];
    if (date && date !== selected) onSelect(date);
  };

  return (
    <Animated.ScrollView
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      accessibilityLabel="주제 날짜 선택"
      accessibilityRole="adjustable"
      accessibilityValue={{ text: topicDateLabel(selected, today) }}
      contentContainerStyle={{ paddingHorizontal: side }}
      contentOffset={{ x: selectedIndex * DATE_DIAL_ITEM_WIDTH, y: 0 }}
      decelerationRate="fast"
      horizontal
      onAccessibilityAction={(event) =>
        step(event.nativeEvent.actionName === "increment" ? 1 : -1)
      }
      // Android clamps scrollTo to the content laid out so far; once the
      // side padding lands, re-center the selected date without animation.
      onContentSizeChange={() => scrollToSelected(false)}
      onLayout={(event: LayoutChangeEvent) =>
        setWidth(event.nativeEvent.layout.width)
      }
      onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) =>
        commit(event.nativeEvent.contentOffset.x)
      }
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
        { useNativeDriver: true },
      )}
      onScrollEndDrag={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (!event.nativeEvent.velocity?.x)
          commit(event.nativeEvent.contentOffset.x);
      }}
      ref={stripRef}
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={DATE_DIAL_ITEM_WIDTH}
      style={styles.dial}
    >
      {items.map((item, index) => {
        const center = index * DATE_DIAL_ITEM_WIDTH;
        const inputRange = [
          center - FADE_RANGE * DATE_DIAL_ITEM_WIDTH,
          center,
          center + FADE_RANGE * DATE_DIAL_ITEM_WIDTH,
        ];
        const isSelected = item === selected;
        return (
          <Animated.View
            key={item}
            style={[
              styles.item,
              {
                opacity: scrollX.interpolate({
                  extrapolate: "clamp",
                  inputRange,
                  outputRange: [0.35, 1, 0.35],
                }),
                transform: [
                  {
                    scale: scrollX.interpolate({
                      extrapolate: "clamp",
                      inputRange,
                      outputRange: [0.9, 1, 0.9],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              accessibilityLabel={`${topicDateLabel(item, today)} 선택`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                if (!isSelected) onSelect(item);
              }}
              style={({ pressed }) => [
                styles.pill,
                {
                  backgroundColor: isSelected
                    ? colors.primary
                    : pressed
                      ? colors.fill
                      : "transparent",
                },
              ]}
            >
              <AppText
                color={isSelected ? colors.onPrimary : colors.textMuted}
                variant="label"
              >
                {topicDateLabel(item, today)}
              </AppText>
            </Pressable>
          </Animated.View>
        );
      })}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  dial: { flexGrow: 0 },
  item: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    width: DATE_DIAL_ITEM_WIDTH,
  },
  pill: {
    alignItems: "center",
    borderRadius: DATE_PILL_HEIGHT / 2,
    justifyContent: "center",
    minHeight: DATE_PILL_HEIGHT,
    paddingHorizontal: appSpacing.sm,
  },
});
