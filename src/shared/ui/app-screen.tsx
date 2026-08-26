import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { ScrollView, StyleSheet } from "react-native";
import type { SafeAreaViewProps } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";

import { appSpacing } from "@/core/theme/tokens";

type AppScreenProps = PropsWithChildren<
  Omit<SafeAreaViewProps, "style"> & {
    backgroundColor: string;
    contentStyle?: StyleProp<ViewStyle>;
    style?: StyleProp<ViewStyle>;
  }
>;

export function AppScreen({
  backgroundColor,
  children,
  contentStyle,
  style,
  ...safeAreaProps
}: AppScreenProps) {
  return (
    <SafeAreaView
      {...safeAreaProps}
      style={[styles.safeArea, { backgroundColor }, style]}
    >
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        style={styles.scrollView}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: appSpacing.md,
  },
});
