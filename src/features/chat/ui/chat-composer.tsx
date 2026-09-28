import { ActivityIndicator, Pressable, View } from "react-native";
import { useRef } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatComposer, appRadii, appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { InlineMessage } from "@/shared/ui/inline-message";
import { AttachmentQueueList } from "@/features/media/ui/attachment-queue-list";
import {
  VoicePreviewBar,
  VoiceRecordingBar,
} from "@/features/media/ui/voice-recorder-bar";
import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";

import { ChatComposerField } from "./chat-composer-field";
import type { ChatComposerFieldHandle } from "./chat-composer-field.types";
import {
  ATTACHMENT_OPTION_UNAVAILABLE,
  useChatComposer,
} from "./use-chat-composer";
import type { ChatComposerController } from "./use-chat-composer";

// The semantic controlSize token owns the approved 44x44 touch target.

/**
 * Generic (non-platform-suffixed) fallback for `tsc`'s bare-import
 * resolution only -- `tsconfig` has no `moduleSuffixes`, so a bare
 * `import { ChatComposer } from "./chat-composer"` (chat-screen.tsx) only
 * typechecks if a non-suffixed `chat-composer.tsx` exists alongside
 * `chat-composer.ios.tsx` / `chat-composer.android.tsx`. Metro and Jest
 * always resolve the platform-suffixed file first (jest resolves iOS by
 * default), so this module never actually renders on-device or under test;
 * it is a plain, flat-surface RN rendering of the same
 * `useChatComposer` state machine (same pattern as `nickname-edit-screen.tsx`
 * / `account-screen.tsx`).
 */
export function ChatComposer({
  controller,
  onMessageCommitted,
  blocked = false,
  attachmentController = null,
  onHeightChange,
}: Readonly<{
  controller: ChatComposerController;
  onMessageCommitted?: (localId: string) => void;
  blocked?: boolean;
  attachmentController?: MediaAttachmentController | null;
  onHeightChange?: (height: number) => void;
}>) {
  const { colors } = useAppTheme();
  const fieldRef = useRef<ChatComposerFieldHandle>(null);
  const composer = useChatComposer({
    attachmentController,
    blocked,
    controller,
    fieldRef,
    onMessageCommitted,
  });
  const lastReportedHeightRef = useRef(-1);
  const reportHeight = (event: {
    nativeEvent: { layout: { height: number } };
  }) => {
    const { height } = event.nativeEvent.layout;
    if (Math.abs(height - lastReportedHeightRef.current) < 0.5) return;
    lastReportedHeightRef.current = height;
    onHeightChange?.(height);
  };

  if (composer.recorder.phase === "recording" && composer.recorder.recording) {
    return (
      <View
        onLayout={reportHeight}
        style={{ gap: appSpacing.xs }}
        testID="chat-composer-root"
      >
        <VoiceRecordingBar
          elapsedMs={composer.recorder.recording.elapsedMs}
          metering={composer.recorder.recording.metering}
          onDelete={composer.recorder.cancelRecording}
          onStop={() => void composer.recorder.stopRecording()}
        />
      </View>
    );
  }

  if (composer.recorder.phase === "preview" && composer.recorder.preview) {
    return (
      <View
        onLayout={reportHeight}
        style={{ gap: appSpacing.xs }}
        testID="chat-composer-root"
      >
        <VoicePreviewBar
          durationMillis={composer.recorder.preview.durationMillis}
          isPlaying={composer.recorder.preview.isPlaying}
          onDelete={composer.recorder.cancelRecording}
          onSend={() => {
            composer.recorder.notifyVoiceMessageSent();
            void composer.send();
          }}
          onTogglePlayback={composer.recorder.preview.togglePlayback}
          positionMillis={composer.recorder.preview.positionMillis}
          sendDisabled={composer.disabled}
        />
      </View>
    );
  }

  return (
    <View
      onLayout={reportHeight}
      style={{ gap: appSpacing.xs }}
      testID="chat-composer-root"
    >
      {attachmentController ? (
        <>
          <AttachmentQueueList
            items={composer.attachments.items}
            onCancel={(id) => composer.attachments.cancel(id)}
            onRemove={(id) => composer.attachments.remove(id)}
            onRetry={(id) => composer.attachments.retry(id)}
          />
          {composer.attachments.lastError ? (
            <InlineMessage
              kind="error"
              message={composer.attachments.lastError.message}
            />
          ) : null}
          {composer.attachments.busy ? (
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
            accessibilityState={{ disabled: composer.sessionBlocksAttach }}
            disabled={composer.sessionBlocksAttach}
            onPress={() => {
              if (composer.canAddImageOrVideo) {
                void composer.attachments.addImageOrVideo();
              } else {
                composer.feedback?.showNotice({
                  message: ATTACHMENT_OPTION_UNAVAILABLE,
                });
              }
            }}
            style={({ pressed }) => ({
              alignItems: "center",
              height: appChatComposer.controlSize,
              justifyContent: "center",
              opacity: composer.sessionBlocksAttach ? 0.5 : pressed ? 0.72 : 1,
              width: appChatComposer.controlSize,
            })}
          >
            <AppSymbol name="attach" size={28} tintColor={colors.textMuted} />
          </Pressable>
        ) : null}
        <ChatComposerField
          accessibilityLabel="메시지 입력"
          onBlur={() => composer.setIsFocused(false)}
          onChangeText={composer.setDraftText}
          onFocus={() => composer.setIsFocused(true)}
          placeholder="메시지"
          ref={fieldRef}
          value={composer.draftText}
        />
        {composer.showMic ? (
          <Pressable
            accessibilityLabel="음성 메시지 녹음"
            accessibilityRole="button"
            accessibilityState={{ disabled: composer.micDisabled }}
            disabled={composer.micDisabled}
            onPress={() => void composer.recorder.startRecording()}
            style={({ pressed }) => ({
              alignItems: "center",
              height: appChatComposer.controlSize,
              justifyContent: "center",
              opacity: composer.micDisabled ? 0.5 : pressed ? 0.72 : 1,
              width: appChatComposer.controlSize,
            })}
          >
            <AppSymbol
              name="microphone"
              size={22}
              tintColor={colors.textMuted}
            />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="메시지 보내기"
            accessibilityRole="button"
            accessibilityState={{ disabled: composer.disabled }}
            disabled={composer.disabled}
            onPress={() => void composer.send()}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: composer.disabled ? colors.fill : colors.primary,
              borderCurve: "continuous",
              borderRadius: appRadii.full,
              height: appChatComposer.controlSize,
              justifyContent: "center",
              opacity: pressed ? 0.72 : 1,
              width: appChatComposer.controlSize,
            })}
          >
            <AppSymbol
              name="send"
              size={20}
              tintColor={
                composer.disabled ? colors.textMuted : colors.onPrimary
              }
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}
