import { Pressable, Text, TextInput, View } from "react-native";
import { useRef, useState } from "react";

import type { ChatSendController } from "@/features/chat/model/chat-send";
import type { ConnectedPendingAttachment } from "@/features/chat/model/connected-chat-presentation";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatComposer, appSpacing } from "@/core/theme/tokens";
import { AttachmentPickerButtons } from "@/features/media/ui/attachment-picker-button";
import { AttachmentQueueList } from "@/features/media/ui/attachment-queue-list";
import { isSendableWithoutBody } from "@/features/media/ui/media-composition";
import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";
import { useMediaAttachmentQueue } from "@/features/media/ui/use-media-attachment-queue";

// The semantic controlSize token owns the approved 44x44 touch target.

type ChatSendInputWithMedia = Readonly<{
  body: string;
  clearDraft: () => void;
  onCommitted?: (localId: string) => void;
  media?: readonly ConnectedPendingAttachment[];
}>;

export function ChatComposer({
  controller,
  onMessageCommitted,
  blocked = false,
  attachmentController = null,
}: Readonly<{
  controller: Readonly<{
    send: (
      input: ChatSendInputWithMedia,
    ) => ReturnType<ChatSendController["send"]>;
  }>;
  onMessageCommitted?: (localId: string) => void;
  blocked?: boolean;
  attachmentController?: MediaAttachmentController | null;
}>) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);
  const attachments = useMediaAttachmentQueue(attachmentController);
  const hasBody = draft.trim().length > 0;
  const hasAudioAttachment = attachments.items.some(
    (item) => item.kind === "audio" && item.status !== "cancelled",
  );
  const sendableWithoutBody = isSendableWithoutBody(attachments.items);
  const disabled =
    blocked ||
    isSending ||
    attachments.busy ||
    attachments.items.some(
      (item) => item.status !== "confirmed" || item.confirmed === null,
    ) ||
    (!hasBody && !sendableWithoutBody) ||
    (hasAudioAttachment && hasBody);

  const send = async () => {
    if (disabled || sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    try {
      const confirmedMedia = attachments.items
        .filter(
          (item) => item.status === "confirmed" && item.confirmed !== null,
        )
        .map((item) => item.confirmed!);
      await controller.send({
        body: hasAudioAttachment ? "" : draft,
        clearDraft: () => {
          setDraft((current) => (current === draft ? "" : current));
          // This callback is invoked only after the existing SQLite outbox commit.
          // A DB error retains every selected upload for the same retry.
          for (const item of attachments.items)
            attachments.remove(item.localId);
        },
        onCommitted: onMessageCommitted,
        ...(confirmedMedia.length ? { media: confirmedMedia } : {}),
      });
    } catch {
      // The controller intentionally retains the draft after a local write failure.
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const addAudio = () => {
    if (hasBody) return;
    void attachments.addAudio();
  };

  return (
    <View style={{ gap: appSpacing.xs }}>
      {attachmentController ? (
        <>
          <AttachmentQueueList
            items={attachments.items}
            onCancel={(id) => {
              if (!sendingRef.current && !blocked) attachments.cancel(id);
            }}
            onRetry={(id) => {
              if (!sendingRef.current && !blocked) attachments.retry(id);
            }}
            onRemove={(id) => {
              if (!sendingRef.current && !blocked) attachments.remove(id);
            }}
          />
          {attachments.lastError ? (
            <Text style={{ color: colors.error }}>
              {attachments.lastError.message}
            </Text>
          ) : null}
          <AttachmentPickerButtons
            busy={attachments.busy || isSending}
            canAddImageOrVideo={
              !blocked && !isSending && attachments.canAddImageOrVideo
            }
            canAddAudio={
              !blocked && !isSending && attachments.canAddAudio && !hasBody
            }
            onAddImageOrVideo={() => void attachments.addImageOrVideo()}
            onAddAudio={addAudio}
          />
        </>
      ) : null}
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
    </View>
  );
}
