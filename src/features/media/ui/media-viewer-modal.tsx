import type { PropsWithChildren } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";

/** Each native modal has its own safe-area coordinate space. */
export function MediaViewerModal({
  label,
  closeLabel,
  onClose,
  children,
}: PropsWithChildren<{
  label: string;
  closeLabel: string;
  onClose: () => void;
}>) {
  const { colors } = useAppTheme();
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
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: appSpacing.md,
              gap: appSpacing.sm,
            }}
          >
            <Text numberOfLines={2} style={{ color: colors.text, flex: 1 }}>
              {label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              style={{
                minHeight: appControl.standardHeight,
                minWidth: appControl.standardHeight,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.primary }}>닫기</Text>
            </Pressable>
          </View>
          {children}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
