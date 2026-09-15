import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useRef, useState } from "react";
import { BottomSheet, Host, List, ListItem, Text as UIText } from "@expo/ui";

import type { ChatSendController } from "@/features/chat/model/chat-send";
import type { ConnectedPendingAttachment } from "@/features/chat/model/connected-chat-presentation";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatComposer, appRadii, appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { InlineMessage } from "@/shared/ui/inline-message";
import { AttachmentQueueList } from "@/features/media/ui/attachment-queue-list";
import { isSendableWithoutBody } from "@/features/media/ui/media-composition";
import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";
import { useMediaAttachmentQueue } from "@/features/media/ui/use-media-attachment-queue";

// The semantic controlSize token owns the approved 44x44 touch target.

const ATTACHMENT_OPTION_UNAVAILABLE = "지금은 추가할 수 없습니다";

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
  const [sheetOpen, setSheetOpen] = useState(false);
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

  // The session-level gate (blocked/in-flight/converting) applies to both
  // attachment options in addition to each option's own canAdd rule.
  const sessionBlocksAttach = blocked || isSending || attachments.busy;
  const canAddImageOrVideo =
    !sessionBlocksAttach && attachments.canAddImageOrVideo;
  const canAddAudio =
    !sessionBlocksAttach && attachments.canAddAudio && !hasBody;

  const addImageOrVideo = () => {
    setSheetOpen(false);
    void attachments.addImageOrVideo();
  };

  const addAudio = () => {
    if (hasBody) return;
    setSheetOpen(false);
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
            <InlineMessage
              kind="error"
              message={attachments.lastError.message}
            />
          ) : null}
          {attachments.busy ? (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                gap: appSpacing.xxs,
              }}
            >
              <ActivityIndicator />
              <AppText accessibilityLiveRegion="polite" variant="caption">
                파일 선택·변환 중…
              </AppText>
            </View>
          ) : null}
        </>
      ) : null}
      <View
        style={{
          alignItems: "flex-end",
          flexDirection: "row",
          gap: 8,
          paddingVertical: 8,
        }}
      >
        {attachmentController ? (
          <Pressable
            accessibilityLabel="첨부 추가"
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked || isSending }}
            disabled={blocked || isSending}
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => ({
              alignItems: "center",
              height: appChatComposer.controlSize,
              justifyContent: "center",
              opacity: blocked || isSending ? 0.5 : pressed ? 0.72 : 1,
              width: appChatComposer.controlSize,
            })}
          >
            <AppSymbol name="attach" size={28} tintColor={colors.primary} />
          </Pressable>
        ) : null}
        <TextInput
          accessibilityLabel="메시지 입력"
          multiline
          onBlur={() => setIsFocused(false)}
          onChangeText={setDraft}
          onFocus={() => setIsFocused(true)}
          placeholder="메시지 입력..."
          placeholderTextColor={colors.placeholder as string}
          style={{
            backgroundColor: colors.surface,
            borderColor: isFocused ? colors.primary : colors.border,
            borderCurve: "continuous",
            borderRadius: appRadii.full,
            borderWidth: 1,
            color: colors.text,
            flex: 1,
            fontSize: 16,
            lineHeight: 22,
            maxHeight: appChatComposer.maxHeight,
            minHeight: appChatComposer.minHeight,
            paddingHorizontal: 16,
            paddingVertical: 12,
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
            backgroundColor: disabled ? colors.fill : colors.primary,
            borderCurve: "continuous",
            borderRadius: 22,
            height: appChatComposer.controlSize,
            justifyContent: "center",
            opacity: pressed ? 0.72 : 1,
            width: appChatComposer.controlSize,
          })}
        >
          <AppSymbol
            name="send"
            size={20}
            tintColor={disabled ? colors.textMuted : colors.onPrimary}
          />
        </Pressable>
      </View>
      {attachmentController ? (
        <Host>
          <BottomSheet
            isPresented={sheetOpen}
            onDismiss={() => setSheetOpen(false)}
          >
            <List>
              {/*
                Workaround for an upstream @expo/ui Android bug: when `onPress`
                goes from present to absent on an already-mounted ListItem,
                ListItem.android.tsx computes
                `modifiers={itemModifiers.length ? itemModifiers : undefined}`
                and forwards `modifiers=undefined`; expo-modules-core's
                `ListTypeConverter.convertFromDynamic` cannot cast that prop
                update and crashes ("Cannot set prop 'modifiers' ...
                DynamicFromMap"). Keying each item by its own availability
                forces React to unmount+remount instead of diffing `onPress`
                away. Drop these keys once upstream @expo/ui passes `[]`
                instead of `undefined` for a ListItem without `onPress`.
              */}
              <ListItem
                key={canAddImageOrVideo ? "image-on" : "image-off"}
                testID="attachment-option-image"
                {...(canAddImageOrVideo
                  ? { onPress: addImageOrVideo }
                  : { supportingText: ATTACHMENT_OPTION_UNAVAILABLE })}
              >
                <UIText>{"사진·동영상 첨부"}</UIText>
              </ListItem>
              <ListItem
                key={canAddAudio ? "audio-on" : "audio-off"}
                testID="attachment-option-audio"
                {...(canAddAudio
                  ? { onPress: addAudio }
                  : { supportingText: ATTACHMENT_OPTION_UNAVAILABLE })}
              >
                <UIText>{"음성 파일 첨부"}</UIText>
              </ListItem>
            </List>
          </BottomSheet>
        </Host>
      ) : null}
    </View>
  );
}
