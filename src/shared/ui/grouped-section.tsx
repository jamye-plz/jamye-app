import { Children, Fragment } from "react";
import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { appRadii } from "@/core/theme/tokens";

type GroupedSectionProps = PropsWithChildren<{
  footer?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  title?: string;
}>;

export function GroupedSection({
  children,
  footer,
  style,
  testID,
  title,
}: GroupedSectionProps) {
  const { colors } = useAppThemeOrSystem();
  const isIos = process.env.EXPO_OS === "ios";
  const items = Children.toArray(children);

  return (
    <View style={style} testID={testID}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={[
            isIos ? styles.titleIos : styles.titleAndroid,
            { color: isIos ? colors.textMuted : colors.primary },
          ]}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={
          isIos
            ? [
                styles.containerIos,
                {
                  backgroundColor: colors.secondaryGroupedBackground,
                  borderRadius: appRadii.medium,
                },
              ]
            : { backgroundColor: colors.surface }
        }
      >
        {items.map((child, index) => (
          <Fragment key={`grouped-section-item-${index}`}>
            {index > 0 ? (
              <View
                style={[
                  styles.divider,
                  {
                    backgroundColor: colors.divider,
                    marginLeft: isIos ? 16 : 0,
                  },
                ]}
                testID="grouped-section-divider"
              />
            ) : null}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text style={[styles.footer, { color: colors.textMuted }]}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  containerIos: {
    borderCurve: "continuous",
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  footer: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  titleAndroid: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  titleIos: {
    fontSize: 13,
    lineHeight: 18,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
});
