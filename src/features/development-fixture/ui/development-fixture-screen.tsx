import { StyleSheet, View } from "react-native";

import { appLayout, appRadii, appSpacing } from "@/core/theme/tokens";
import { useAppTheme } from "@/core/theme/theme-provider";
import { LOCAL_DEVELOPMENT_FIXTURE } from "@/features/development-fixture/model/local-fixture";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";

export function DevelopmentFixtureScreen() {
  const theme = useAppTheme();

  return (
    <AppScreen
      backgroundColor={theme.colors.background}
      contentStyle={styles.screenContent}
    >
      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.divider,
          },
        ]}
      >
        <View style={styles.headingGroup}>
          <AppText
            accessibilityRole="header"
            color={theme.colors.text}
            variant="title"
          >
            잼얘좀 개발 빌드
          </AppText>
          <AppText color={theme.colors.textMuted}>
            모바일 기반을 준비하는 로컬 앱 화면입니다.
          </AppText>
        </View>

        <View
          style={[
            styles.modeBadge,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <AppText color={theme.colors.text} variant="label">
            {LOCAL_DEVELOPMENT_FIXTURE.mode}
          </AppText>
        </View>

        <View
          style={[
            styles.notice,
            { backgroundColor: theme.colors.noticeSurface },
          ]}
        >
          <AppText color={theme.colors.text}>
            {LOCAL_DEVELOPMENT_FIXTURE.notice}
          </AppText>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    justifyContent: "center",
    paddingVertical: appSpacing.xxl,
  },
  panel: {
    alignSelf: "center",
    borderRadius: appRadii.extraLarge,
    borderWidth: 1,
    gap: appSpacing.xl,
    maxWidth: appLayout.contentMaxWidth,
    padding: appSpacing.xl,
    width: "100%",
  },
  headingGroup: {
    gap: appSpacing.xs,
  },
  modeBadge: {
    alignSelf: "flex-start",
    borderRadius: appRadii.full,
    borderWidth: 1,
    paddingHorizontal: appSpacing.sm,
    paddingVertical: appSpacing.xs,
  },
  notice: {
    borderRadius: appRadii.large,
    padding: appSpacing.md,
  },
});
