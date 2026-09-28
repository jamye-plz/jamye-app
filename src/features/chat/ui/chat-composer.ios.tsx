import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { ColorValue, ViewStyle } from "react-native";
import { useRef } from "react";
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";

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

import { ChatComposerField } from "./chat-composer-field.ios";
import type { ChatComposerFieldHandle } from "./chat-composer-field.types";
import {
  ATTACHMENT_OPTION_UNAVAILABLE,
  useChatComposer,
} from "./use-chat-composer";
import type { ChatComposerController } from "./use-chat-composer";

// The semantic controlSize token owns the approved 44x44 touch target.

/**
 * W1 (decided): a Liquid Glass chrome behind each control -- a circular
 * glass "+" button, a glass capsule text field, and a circular glass
 * mic/send button, grouped in one `GlassContainer` so nearby glass shapes
 * blend the way iOS 26 Messages does. Falls back to a flat material-style
 * surface (`colors.surface` + a hairline border) on iOS < 26 or when Liquid
 * Glass is otherwise unavailable, per `isLiquidGlassAvailable()`.
 */
function LiquidGlassChrome({
  children,
  interactive = false,
  style,
  tintColor,
}: Readonly<{
  children: React.ReactNode;
  interactive?: boolean;
  style: ViewStyle;
  tintColor?: ColorValue;
}>) {
  const { colors } = useAppTheme();
  if (!isLiquidGlassAvailable()) {
    return (
      <View
        style={[
          style,
          {
            backgroundColor: tintColor ?? colors.surface,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <GlassView
      glassEffectStyle="regular"
      isInteractive={interactive}
      style={style}
      tintColor={tintColor as string | undefined}
    >
      {children}
    </GlassView>
  );
}

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
  // The composer reports only its own measured height (draft row + record
  // bar included); keyboard frame and list inset math stay owned by the
  // chat-list screen (api_contracts.app_chat_parallel_interfaces.layoutContract).
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
      <GlassContainer
        spacing={8}
        style={{
          alignItems: "flex-end",
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: appSpacing.sm,
          paddingVertical: 8,
        }}
      >
        {attachmentController ? (
          <LiquidGlassChrome
            interactive={!composer.sessionBlocksAttach}
            style={{
              borderCurve: "continuous",
              borderRadius: appRadii.full,
              height: appChatComposer.controlSize,
              overflow: "hidden",
              width: appChatComposer.controlSize,
            }}
          >
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
                height: "100%",
                justifyContent: "center",
                opacity: pressed ? 0.72 : 1,
                width: "100%",
              })}
            >
              <AppSymbol
                name="add"
                size={20}
                tintColor={colors.text}
                weight="medium"
              />
            </Pressable>
          </LiquidGlassChrome>
        ) : null}
        <LiquidGlassChrome
          style={{
            borderCurve: "continuous",
            borderRadius: appRadii.full,
            flex: 1,
            justifyContent: "center",
            maxHeight: appChatComposer.maxHeight,
            // Same height as the round controls beside it (iMessage).
            minHeight: appChatComposer.controlSize,
            paddingHorizontal: appSpacing.sm,
          }}
        >
          <ChatComposerField
            accessibilityLabel="메시지 입력"
            onBlur={() => composer.setIsFocused(false)}
            onChangeText={composer.setDraftText}
            onFocus={() => composer.setIsFocused(true)}
            placeholder="메시지"
            ref={fieldRef}
            value={composer.draftText}
          />
        </LiquidGlassChrome>
        {composer.showMic ? (
          <LiquidGlassChrome
            interactive={!composer.micDisabled}
            style={{
              borderCurve: "continuous",
              borderRadius: appRadii.full,
              height: appChatComposer.controlSize,
              overflow: "hidden",
              width: appChatComposer.controlSize,
            }}
          >
            <Pressable
              accessibilityLabel="음성 메시지 녹음"
              accessibilityRole="button"
              accessibilityState={{ disabled: composer.micDisabled }}
              disabled={composer.micDisabled}
              onPress={() => void composer.recorder.startRecording()}
              style={({ pressed }) => ({
                alignItems: "center",
                height: "100%",
                justifyContent: "center",
                opacity: pressed ? 0.72 : 1,
                width: "100%",
              })}
            >
              <AppSymbol
                name="microphone"
                size={20}
                tintColor={colors.text}
                weight="medium"
              />
            </Pressable>
          </LiquidGlassChrome>
        ) : (
          // Berry accent (colors.primary), a filled circle -- the one
          // deliberately-colored control per ADR-0011.
          <LiquidGlassChrome
            interactive={!composer.disabled}
            style={{
              borderCurve: "continuous",
              borderRadius: appRadii.full,
              height: appChatComposer.controlSize,
              overflow: "hidden",
              width: appChatComposer.controlSize,
            }}
            tintColor={composer.disabled ? colors.fill : colors.primary}
          >
            <Pressable
              accessibilityLabel="메시지 보내기"
              accessibilityRole="button"
              accessibilityState={{ disabled: composer.disabled }}
              disabled={composer.disabled}
              onPress={() => void composer.send()}
              style={({ pressed }) => ({
                alignItems: "center",
                height: "100%",
                justifyContent: "center",
                opacity: pressed ? 0.72 : 1,
                width: "100%",
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
          </LiquidGlassChrome>
        )}
      </GlassContainer>
    </View>
  );
}
