import type { PropsWithChildren } from "react";
import type { ColorValue } from "react-native";
import { Modal, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import { HeaderIconButton } from "@/shared/ui/header-icon-button";

/** Each native modal has its own safe-area coordinate space. `backgroundColor`
 * overrides the themed `colors.background` for viewers that always render on
 * black regardless of light/dark theme (the photo viewer). */
export function MediaViewerModal({
  label,
  closeLabel,
  backgroundColor,
  onClose,
  children,
}: PropsWithChildren<{
  label: string;
  closeLabel: string;
  backgroundColor?: ColorValue;
  onClose: () => void;
}>) {
  const { colors } = useAppTheme();
  const background = backgroundColor ?? colors.background;
  const foreground = backgroundColor ? "#FFFFFF" : colors.text;
  const iconTint = backgroundColor ? "#FFFFFF" : colors.primary;
  return (
    <Modal
      testID="media-viewer-modal"
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={{ backgroundColor: background, flex: 1 }}>
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: appSpacing.sm,
              paddingHorizontal: appSpacing.md,
            }}
          >
            <AppText
              color={foreground}
              numberOfLines={1}
              style={{ flex: 1 }}
              variant="headline"
            >
              {label}
            </AppText>
            <HeaderIconButton
              accessibilityLabel={closeLabel}
              onPress={onClose}
              symbol="close"
              tintColor={iconTint}
            />
          </View>
          {children}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
