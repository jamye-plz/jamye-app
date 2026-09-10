import type { ComponentProps, PropsWithChildren } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/core/theme/theme-provider";
import {
  appControl,
  appRadii,
  appSpacing,
  appTypography,
} from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import type { TopicsError } from "../model/topics-state";

export function TopicText({
  color,
  ...props
}: Omit<ComponentProps<typeof AppText>, "color"> & { color?: string }) {
  const { colors } = useAppTheme();
  return <AppText {...props} color={color ?? colors.text} />;
}

export function TopicButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  secondary = false,
  selected = false,
}: Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  selected?: boolean;
}>) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy, selected }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor:
            disabled || busy
              ? colors.surfaceMuted
              : secondary
                ? colors.surface
                : colors.primary,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <AppText
        variant="label"
        color={
          disabled || busy
            ? colors.textMuted
            : secondary
              ? colors.text
              : colors.onPrimary
        }
      >
        {busy ? `${label} 처리 중…` : label}
      </AppText>
    </Pressable>
  );
}
export function TopicField({
  label,
  ...props
}: TextInputProps & Readonly<{ label: string }>) {
  const { colors } = useAppTheme();
  return (
    <>
      <AppText color={colors.text}>{label}</AppText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.field,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          props.style,
        ]}
      />
    </>
  );
}
export function TopicLayout({ children }: PropsWithChildren) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const errors: Record<TopicsError, string> = {
  network:
    "응답을 확인하지 못했습니다. 입력을 유지했으니 연결 상태를 확인한 뒤 같은 요청을 재시도해 주세요.",
  unavailable: "서버를 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.",
  unauthorized: "로그인이 필요합니다. 계정 상태를 확인해 주세요.",
  forbidden:
    "이 작업의 권한이 없습니다. 그룹 가입 상태와 작성자 권한을 확인해 주세요.",
  not_found: "주제 또는 그룹을 찾을 수 없습니다.",
  conflict:
    "이전 생성 시도와 충돌합니다. 결과를 확인한 뒤 같은 요청을 재시도해 주세요.",
  validation: "제목·본문·태그 입력값을 확인해 주세요.",
  invalid_response:
    "서버 응답을 확인할 수 없습니다. 주제를 다시 불러와 주세요.",
  storage: "주제를 저장소에서 처리하지 못했습니다. 다시 불러와 주세요.",
};
export function TopicError({ error }: Readonly<{ error: TopicsError | null }>) {
  const { colors } = useAppTheme();
  return error ? (
    <AppText
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      color={colors.error}
    >
      {errors[error]}
    </AppText>
  ) : null;
}
export const topicStyles = StyleSheet.create({
  content: {
    padding: appSpacing.md,
    gap: appSpacing.md,
    paddingBottom: appSpacing.xxxl,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  gap: { gap: appSpacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: appSpacing.sm },
  card: {
    padding: appSpacing.md,
    borderWidth: 1,
    borderRadius: appRadii.medium,
    gap: appSpacing.sm,
  },
});
const styles = StyleSheet.create({
  ...topicStyles,
  fill: { flex: 1 },
  button: {
    minHeight: appControl.standardHeight,
    minWidth: appControl.standardHeight,
    padding: appSpacing.sm,
    borderRadius: appRadii.medium,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  field: {
    ...appTypography.body,
    minHeight: appControl.standardHeight,
    borderWidth: 1,
    borderRadius: appRadii.small,
    padding: appSpacing.sm,
  },
});
