import { forwardRef, useState } from "react";
import type { StyleProp, TextInputProps, ViewStyle } from "react-native";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { appControl, appRadii, appSpacing } from "@/core/theme/tokens";

type FormFieldProps = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
  error?: string;
  helper?: string;
  label: string;
};

export const FormField = forwardRef<TextInput, FormFieldProps>(
  function FormField(
    {
      containerStyle,
      error,
      helper,
      label,
      multiline,
      onBlur,
      onFocus,
      style,
      ...inputProps
    },
    ref,
  ) {
    const { colors } = useAppThemeOrSystem();
    const [focused, setFocused] = useState(false);
    const isIos = process.env.EXPO_OS === "ios";

    return (
      <View style={containerStyle}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          multiline={multiline}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={colors.placeholder as string}
          ref={ref}
          style={[
            isIos
              ? [
                  styles.inputIos,
                  {
                    backgroundColor: colors.secondaryGroupedBackground,
                    borderColor: focused ? colors.primary : "transparent",
                    color: colors.text,
                  },
                ]
              : [
                  styles.inputAndroid,
                  {
                    backgroundColor: colors.surface,
                    borderColor: focused ? colors.primary : colors.border,
                    color: colors.text,
                  },
                ],
            multiline ? styles.multiline : null,
            style,
          ]}
          {...inputProps}
        />
        {helper ? (
          <Text style={[styles.helperText, { color: colors.textMuted }]}>
            {helper}
          </Text>
        ) : null}
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[styles.helperText, { color: colors.error }]}
          >
            {error}
          </Text>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  helperText: {
    fontSize: 13,
    lineHeight: 18,
  },
  inputAndroid: {
    borderRadius: appRadii.small,
    borderWidth: 1,
    fontSize: 16,
    minHeight: appControl.standardHeight,
    padding: appSpacing.sm,
  },
  inputIos: {
    borderCurve: "continuous",
    borderRadius: appRadii.medium,
    borderWidth: 2,
    fontSize: 16,
    minHeight: appControl.standardHeight,
    padding: appSpacing.sm,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
  },
  multiline: {
    textAlignVertical: "top",
  },
});
