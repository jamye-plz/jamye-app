import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import type { TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/core/theme/theme-provider";
import {
  appControl,
  appRadii,
  appSpacing,
  appTypography,
} from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import type { GroupsErrorOutcome } from "../model/groups-error";

export function GroupButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  retryAt = 0,
}: Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  retryAt?: number;
}>) {
  const { colors } = useAppTheme();
  const [clock, setClock] = useState(Date.now);
  const waiting = retryAt > clock;
  const unavailable = disabled || busy || waiting;
  useEffect(() => {
    const remaining = retryAt - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(remaining, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [retryAt, clock]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy }}
      accessibilityHint={
        waiting
          ? "서버가 안내한 대기시간이 지나면 다시 사용할 수 있습니다."
          : undefined
      }
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: unavailable ? colors.surfaceMuted : colors.primary,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <AppText
        color={unavailable ? colors.textMuted : colors.onPrimary}
        variant="label"
      >
        {busy ? `${label} 처리 중…` : label}
      </AppText>
    </Pressable>
  );
}

export function GroupField({
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

export function GroupFormLayout({ children }: PropsWithChildren) {
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

export function groupErrorMessage(error: GroupsErrorOutcome): string {
  switch (error.kind) {
    case "validation":
      return "입력값을 확인해 주세요.";
    case "membership_required":
      return "이 그룹에 접근할 수 없습니다. 가입 상태를 확인해 주세요.";
    case "owner_required":
      return "그룹 소유자만 할 수 있습니다. 현재 권한을 다시 확인합니다.";
    case "not_found":
      return error.code === "invite_not_found"
        ? "초대 코드를 찾을 수 없습니다."
        : error.code === "member_not_found"
          ? "해당 멤버를 찾을 수 없습니다."
          : "그룹을 찾을 수 없습니다.";
    case "conflict":
      return error.code === "group_full"
        ? "그룹 정원이 가득 찼습니다."
        : error.code === "group_owner_conflict"
          ? "소유권을 먼저 다른 멤버에게 넘겨 주세요."
          : "그룹 상태가 변경되었습니다. 새로고침 후 확인해 주세요.";
    case "invite_terminal":
      return error.code === "invite_expired"
        ? "만료된 초대 코드입니다."
        : "사용 횟수를 모두 소진한 초대 코드입니다.";
    case "rate_limited":
      return error.retryAfterSeconds === null
        ? "요청이 많습니다. 잠시 후 다시 시도해 주세요."
        : `요청이 많습니다. ${error.retryAfterSeconds}초 후 다시 시도해 주세요.`;
    case "service_unavailable":
      return "지금은 서버를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    case "network":
      return "응답을 확인하지 못했습니다. 연결 상태를 확인해 주세요.";
    case "cancelled":
      return "요청이 취소되었습니다.";
    case "unknown":
      return "요청 결과를 확인할 수 없습니다. 다시 불러와 확인해 주세요.";
  }
}

export function GroupError({
  error,
}: Readonly<{ error: GroupsErrorOutcome | null }>) {
  const { colors } = useAppTheme();
  return error ? (
    <AppText
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      color={colors.error}
    >
      {groupErrorMessage(error)}
    </AppText>
  ) : null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: appSpacing.md,
    gap: appSpacing.md,
    paddingBottom: appSpacing.xxxl,
  },
  button: {
    minHeight: appControl.standardHeight,
    minWidth: appControl.standardHeight,
    padding: appSpacing.sm,
    borderRadius: appRadii.medium,
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
