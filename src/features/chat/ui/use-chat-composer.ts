import { Linking } from "react-native";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import type { ChatSendController } from "@/features/chat/model/chat-send";
import type { ConnectedPendingAttachment } from "@/features/chat/model/connected-chat-presentation";
import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";
import { isSendableWithoutBody } from "@/features/media/ui/media-composition";
import { useMediaAttachmentQueue } from "@/features/media/ui/use-media-attachment-queue";
import { useOptionalSystemFeedback } from "@/shared/ui/system-feedback";
import {
  VOICE_MIC_PERMISSION_DENIED_MESSAGE,
  VOICE_PREPARE_FAILED_MESSAGE,
  VOICE_TOO_SHORT_MESSAGE,
  VOICE_UPLOAD_FAILED_MESSAGE,
  useChatComposerRecorder,
} from "@/features/chat/ui/chat-composer-recorder";
import type { ChatComposerFieldHandle } from "./chat-composer-field.types";

export const ATTACHMENT_OPTION_UNAVAILABLE = "지금은 추가할 수 없습니다";

type ChatSendInputWithMedia = Readonly<{
  body: string;
  clearDraft: () => void;
  onCommitted?: (localId: string) => void;
  media?: readonly ConnectedPendingAttachment[];
}>;

export type ChatComposerController = Readonly<{
  send: (
    input: ChatSendInputWithMedia,
  ) => ReturnType<ChatSendController["send"]>;
}>;

export type UseChatComposerOptions = Readonly<{
  controller: ChatComposerController;
  onMessageCommitted?: (localId: string) => void;
  blocked?: boolean;
  attachmentController?: MediaAttachmentController | null;
  /** The mounted field's imperative handle -- `send()` clears it (keeping
   * focus) only when the guard below decides the draft is still the one
   * that was sent (see `clearDraft`). */
  fieldRef: RefObject<ChatComposerFieldHandle | null>;
}>;

/**
 * W1/W2 shared orchestration: all composer state and business logic (draft
 * mirror, attachments, recorder, send gating), independent of the
 * iOS/Android chrome. `chat-composer.ios.tsx` (Liquid Glass) and
 * `chat-composer.android.tsx` (M3) both call this and only differ in JSX.
 */
export function useChatComposer({
  controller,
  onMessageCommitted,
  blocked = false,
  attachmentController = null,
  fieldRef,
}: UseChatComposerOptions) {
  const feedback = useOptionalSystemFeedback();
  const [draftText, setDraftText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);
  // A plain "latest value" ref so `clearDraft` can compare against the live
  // draft without making the `setDraftText` updater itself impure (React may
  // invoke updaters twice in dev/StrictMode to catch exactly that). Synced
  // in an effect, not during render -- refs may not be written while
  // rendering (react-hooks/refs) -- which is still ahead of any `send()`
  // call, since that only ever runs from a later discrete event handler.
  const draftTextRef = useRef(draftText);
  useEffect(() => {
    draftTextRef.current = draftText;
  }, [draftText]);
  const attachments = useMediaAttachmentQueue(attachmentController);
  const recorder = useChatComposerRecorder({
    attachmentController,
    onPermissionDenied: () => {
      feedback?.showNotice({
        actionLabel: "설정 열기",
        message: VOICE_MIC_PERMISSION_DENIED_MESSAGE,
        onAction: () => {
          void Linking.openSettings();
        },
      });
    },
    onTooShort: () => {
      feedback?.showNotice({ message: VOICE_TOO_SHORT_MESSAGE });
    },
    onPrepareFailed: () => {
      feedback?.showNotice({ message: VOICE_PREPARE_FAILED_MESSAGE });
    },
  });

  const hasBody = draftText.trim().length > 0;
  const activeAttachments = attachments.items.filter(
    (item) => item.status !== "cancelled",
  );
  const hasActiveAttachment = activeAttachments.length > 0;
  const hasAudioAttachment = activeAttachments.some(
    (item) => item.kind === "audio",
  );
  const sendableWithoutBody = isSendableWithoutBody(attachments.items);

  // A failed voice upload otherwise leaves the preview's send button
  // silently disabled: say so once per failure and offer a retry.
  const failedVoiceId =
    recorder.phase === "preview"
      ? (activeAttachments.find(
          (item) => item.kind === "audio" && item.status === "failed",
        )?.localId ?? null)
      : null;
  const announcedVoiceFailure = useRef<string | null>(null);
  const retryAttachment = attachments.retry;
  useEffect(() => {
    if (failedVoiceId === null) {
      announcedVoiceFailure.current = null;
      return;
    }
    if (announcedVoiceFailure.current === failedVoiceId) return;
    announcedVoiceFailure.current = failedVoiceId;
    feedback?.showNotice({
      actionLabel: "다시 시도",
      message: VOICE_UPLOAD_FAILED_MESSAGE,
      onAction: () => retryAttachment(failedVoiceId),
    });
  }, [failedVoiceId, feedback, retryAttachment]);
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
    const sentDraft = draftText;
    try {
      const confirmedMedia = attachments.items
        .filter(
          (item) => item.status === "confirmed" && item.confirmed !== null,
        )
        .map((item) => item.confirmed!);
      await controller.send({
        body: hasAudioAttachment ? "" : draftText,
        clearDraft: () => {
          // Only clear if the live draft still matches what was sent -- the
          // user may have typed new text while the write was in flight, and
          // that newer text (both the JS mirror and the native buffer) must
          // survive (E11-adjacent: never erase text the user is still
          // composing).
          if (draftTextRef.current === sentDraft) {
            setDraftText("");
            fieldRef.current?.clear();
          }
          // This callback is invoked only after the existing SQLite outbox commit.
          // A DB error retains every selected upload for the same retry.
          for (const item of attachments.items)
            attachments.remove(item.localId);
          recorder.resetAfterSend();
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

  // The session-level gate (blocked/in-flight/converting) applies to the
  // attach control in addition to its own canAdd rule.
  const sessionBlocksAttach =
    blocked || isSending || attachments.busy || recorder.phase !== "idle";
  const canAddImageOrVideo =
    !sessionBlocksAttach && attachments.canAddImageOrVideo;

  // W1: mic replaces send only when the input is empty AND there is nothing
  // staged to send; any text or attachment (even mid-upload) shows send
  // instead (disabled until sendable).
  const showMic =
    !!attachmentController &&
    !hasBody &&
    !hasActiveAttachment &&
    recorder.phase === "idle";
  const micDisabled =
    blocked || isSending || attachments.busy || !attachments.canAddAudio;

  return {
    attachments,
    canAddImageOrVideo,
    disabled,
    draftText,
    feedback,
    isFocused,
    isSending,
    micDisabled,
    recorder,
    send,
    sessionBlocksAttach,
    setDraftText,
    setIsFocused,
    showMic,
  };
}

export type UseChatComposerResult = ReturnType<typeof useChatComposer>;
