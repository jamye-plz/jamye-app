import { ActivityIndicator, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { useRef } from "react";
import { Host } from "@expo/ui";
import {
  FilledIconButton,
  Icon,
  IconButton,
  Row,
} from "@expo/ui/jetpack-compose";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors, appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import { InlineMessage } from "@/shared/ui/inline-message";
import { AttachmentQueueList } from "@/features/media/ui/attachment-queue-list";
import {
  VoicePreviewBar,
  VoiceRecordingBar,
} from "@/features/media/ui/voice-recorder-bar";
import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";

import { ChatComposerField } from "./chat-composer-field.android";
import type { ChatComposerFieldHandle } from "./chat-composer-field.types";
import {
  ATTACHMENT_OPTION_UNAVAILABLE,
  useChatComposer,
} from "./use-chat-composer";
import type { ChatComposerController } from "./use-chat-composer";

const COMPOSER_ICON_SIZE = 24;
const COMPOSER_ICONS = {
  add: require("../../../../assets/icons/material/add.xml") as ImageSourcePropType,
  mic: require("../../../../assets/icons/material/mic.xml") as ImageSourcePropType,
  send: require("../../../../assets/icons/material/send.xml") as ImageSourcePropType,
} as const;

/**
 * W1 (decided): Material 3 chrome -- a plain `IconButton` "+", a filled
 * `TextField` capsule, and a mic `IconButton` that swaps for a Berry
 * `FilledIconButton` "send" (Berry via the `Host`'s `seedColor`, so the
 * default M3 filled-icon-button container color already lands on the app's
 * accent -- no manual color override needed). The composer stays below the
 * message list in normal flow (Android has no floating/overlay treatment;
 * that is iOS-only, see `chat-composer.ios.tsx` and the chat-screen inset
 * fix). The button glyphs are Compose `Icon`s (Material vector assets): an
 * RN symbol hosted inside a Compose `IconButton` took the touch on device
 * and the button never received its click.
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
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
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
      <Host
        matchContents={{ vertical: true }}
        seedColor={hex.primary}
        style={{ width: "100%" }}
        testID="chat-composer-m3-row"
      >
        <Row horizontalArrangement={{ spacedBy: 8 }}>
          {attachmentController ? (
            <IconButton
              enabled={!composer.sessionBlocksAttach}
              onClick={() => {
                if (composer.canAddImageOrVideo) {
                  void composer.attachments.addImageOrVideo();
                } else {
                  composer.feedback?.showNotice({
                    message: ATTACHMENT_OPTION_UNAVAILABLE,
                  });
                }
              }}
            >
              <Icon
                contentDescription="첨부 추가"
                size={COMPOSER_ICON_SIZE}
                source={COMPOSER_ICONS.add}
                tint={hex.textMuted}
              />
            </IconButton>
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
            <IconButton
              enabled={!composer.micDisabled}
              onClick={() => void composer.recorder.startRecording()}
            >
              <Icon
                contentDescription="음성 메시지 녹음"
                size={COMPOSER_ICON_SIZE}
                source={COMPOSER_ICONS.mic}
                tint={hex.textMuted}
              />
            </IconButton>
          ) : (
            // Berry accent via the Host's seedColor -- FilledIconButton's
            // default container color already lands on the app's accent.
            <FilledIconButton
              enabled={!composer.disabled}
              onClick={() => void composer.send()}
            >
              <Icon
                contentDescription="메시지 보내기"
                size={COMPOSER_ICON_SIZE}
                source={COMPOSER_ICONS.send}
                tint={composer.disabled ? hex.textMuted : hex.onPrimary}
              />
            </FilledIconButton>
          )}
        </Row>
      </Host>
    </View>
  );
}
