import { Pressable, Text, TextInput, View } from "react-native";
import { useState } from "react";

import type { ChatSendController } from "@/features/chat/model/chat-send";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatComposer, appSpacing } from "@/core/theme/tokens";

// The semantic controlSize token owns the approved 44x44 touch target.

export function ChatComposer({
  controller,
  onMessageCommitted,
}: Readonly<{
  controller: Pick<ChatSendController, "send">;
  onMessageCommitted?: (localId: string) => void;
}>) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const disabled = isSending || draft.trim().length === 0;

  const send = async () => {
    if (disabled) return;
    setIsSending(true);
    try {
      await controller.send({
        body: draft,
        clearDraft: () => setDraft(""),
        onCommitted: onMessageCommitted,
      });
    } catch {
      // The controller intentionally retains the draft after a local write failure.
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View
      style={{
        alignItems: "flex-end",
        flexDirection: "row",
        gap: appSpacing.xs,
      }}
    >
      <TextInput
        accessibilityLabel="메시지 입력"
        multiline
        onBlur={() => setIsFocused(false)}
        onChangeText={setDraft}
        onFocus={() => setIsFocused(true)}
        placeholder="메시지 입력..."
        placeholderTextColor={colors.textMuted}
        style={{
          backgroundColor: colors.surface,
          borderColor: isFocused ? colors.primary : colors.border,
          borderRadius: appChatComposer.borderRadius,
          borderWidth: 2,
          color: colors.text,
          flex: 1,
          maxHeight: appChatComposer.maxHeight,
          minHeight: appChatComposer.minHeight,
          padding: appSpacing.sm,
        }}
        value={draft}
      />
      <Pressable
        accessibilityLabel="메시지 보내기"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => void send()}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: colors.primary,
          borderRadius: appChatComposer.borderRadius,
          height: appChatComposer.controlSize,
          justifyContent: "center",
          minWidth: appChatComposer.controlSize,
          opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
          paddingHorizontal: appSpacing.sm,
        })}
      >
        <Text style={{ color: colors.onPrimary }}>메시지 보내기</Text>
      </Pressable>
    </View>
  );
}
