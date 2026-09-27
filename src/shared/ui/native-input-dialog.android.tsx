import { Host } from "@expo/ui";
import {
  Column,
  Icon,
  IconButton,
  OutlinedTextField,
  Row,
  Text,
  TextButton,
  useNativeState,
} from "@expo/ui/jetpack-compose";
import {
  fillMaxWidth,
  paddingAll,
  weight,
} from "@expo/ui/jetpack-compose/modifiers";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

import type { NativeInputShellProps } from "./native-input-shell.types";

export type * from "./native-input-shell.types";

const CLOSE_ICON =
  require("../../../assets/icons/material/close.xml") as ImageSourcePropType;

/**
 * One-line input screen scaffold (C3): an M3 full-screen dialog with its own
 * top bar (✕ close, start-aligned title, submit text action) in place of the
 * stack header, which it hides, and an `OutlinedTextField` body
 * (supporting text is the error text, or the helper text when there's no
 * error). `busy` disables the field and both actions so a slow submit can't
 * double-fire. The field is bound to an `ObservableState` (`useNativeState`)
 * solely so `initialValue` (e.g. a pending-invite code, A3) can be pushed in
 * after mount; typed input still only reaches the caller through
 * `onChangeValue`. iOS resolves to `native-input-sheet.ios.tsx`.
 */
export function NativeInputDialog({
  autoFocus,
  busy,
  errorText,
  helperText,
  initialValue,
  onCancel,
  onChangeValue,
  onSubmit,
  placeholder,
  submitDisabled,
  submitLabel,
  testID,
  title,
}: NativeInputShellProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const disableSubmit = Boolean(submitDisabled) || Boolean(busy);
  const supportingText = errorText ?? helperText;
  const insets = useSafeAreaInsets();
  const value = useNativeState(initialValue ?? "");
  useEffect(() => {
    if (initialValue !== undefined) value.set(initialValue);
  }, [initialValue, value]);
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Host
        seedColor={hex.primary}
        style={{ flex: 1 }}
        testID={testID}
        useViewportSizeMeasurement
      >
        <Column modifiers={[fillMaxWidth()]}>
          <Row
            horizontalArrangement={{ spacedBy: 8 }}
            modifiers={[fillMaxWidth(), paddingAll(8)]}
            verticalAlignment="center"
          >
            <IconButton enabled={!busy} onClick={onCancel}>
              <Icon
                contentDescription="닫기"
                source={CLOSE_ICON}
                tint={hex.text}
              />
            </IconButton>
            <Text
              color={hex.text}
              modifiers={[weight(1)]}
              style={{ typography: "titleLarge" }}
            >
              {title}
            </Text>
            <TextButton enabled={!disableSubmit} onClick={onSubmit}>
              <Text color={disableSubmit ? hex.textMuted : hex.primary}>
                {submitLabel}
              </Text>
            </TextButton>
          </Row>
          <OutlinedTextField
            autoFocus={autoFocus}
            enabled={!busy}
            isError={Boolean(errorText)}
            modifiers={[fillMaxWidth(), paddingAll(16)]}
            onValueChange={onChangeValue}
            value={value}
          >
            <OutlinedTextField.Placeholder>
              <Text>{placeholder ?? ""}</Text>
            </OutlinedTextField.Placeholder>
            {supportingText ? (
              <OutlinedTextField.SupportingText>
                <Text color={errorText ? hex.error : hex.textMuted}>
                  {supportingText}
                </Text>
              </OutlinedTextField.SupportingText>
            ) : null}
          </OutlinedTextField>
        </Column>
      </Host>
    </View>
  );
}
