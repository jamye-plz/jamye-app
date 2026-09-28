import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSession } from "@/core/providers/session-provider";
import { useAccountScope } from "@/core/providers/app-providers";
import { useAppTheme } from "@/core/theme/theme-provider";
import { useMediaUploadQueue } from "@/features/media/model/use-media-upload-queue";
import { AppScreen } from "@/shared/ui/app-screen";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";
import { useConnectedChat } from "../model/connected-chat-provider";
import {
  chatErrorMessage,
  isChatIdentifier,
  toChatConversation,
} from "../model/connected-chat-presentation";
import type { ConnectedPendingAttachment } from "../model/connected-chat-presentation";
import { useChatroomTitle } from "../model/use-chatroom-title";
import { ChatConversationScreen } from "./chat-screen";

export function ConnectedChatScreen({
  groupId,
  chatroomId,
}: Readonly<{ groupId: string; chatroomId: string }>) {
  const { state, actions, ready } = useConnectedChat();
  const { principal } = useSession();
  const account = useAccountScope();
  const { colors } = useAppTheme();
  const router = useRouter();
  const focused = useRef<string | null>(null);
  const titleResolution = useChatroomTitle(groupId, chatroomId);
  const onTitlePress =
    titleResolution.kind === "main"
      ? () =>
          router.push({
            params: { groupId },
            pathname: "/groups/[groupId]/chatrooms/info",
          })
      : titleResolution.kind === "topic" && titleResolution.targetTopicId
        ? () =>
            router.push({
              params: { groupId, topicId: titleResolution.targetTopicId! },
              pathname: "/groups/[groupId]/topics/[topicId]",
            })
        : undefined;
  const valid = isChatIdentifier(groupId) && isChatIdentifier(chatroomId);
  const attachments = useMediaUploadQueue(
    "chat",
    chatroomId,
    valid && ready && state.chatroomId === chatroomId && !state.accessLost,
  );
  useFocusEffect(
    useCallback(() => {
      focused.current = chatroomId;
      if (valid && ready) void actions.openRoom(chatroomId);
      return () => {
        focused.current = null;
      };
    }, [actions, chatroomId, ready, valid]),
  );
  // R4 lifecycle fix: a `useFocusEffect` blur fires whenever another screen
  // is pushed on top (group info, topic detail) even though this screen
  // stays mounted in the stack underneath -- closing the room there used to
  // swap `ChatConversationScreen` for the "대화 준비 중…" placeholder
  // (`state.chatroomId !== chatroomId` below), unmounting `ChatComposer`
  // with it (losing the in-progress draft) and re-triggering the one-shot
  // initial-reveal effect on the way back. The room instead stays open the
  // whole time this component instance is mounted (`openRoom` on every
  // focus, including a refocus of the *same* room, is now a quiet resync --
  // see `connected-chat-store.ts`'s `openRoom`) and is only closed when this
  // screen instance actually goes away (unmount: back navigation, or this
  // chatroomId being replaced by a different one). `stateChatroomIdRef`
  // guards against closing a room a differently-focused screen has since
  // taken over, in case an unmount effect flushes after that other screen's
  // own `openRoom` already reassigned it.
  const stateChatroomIdRef = useRef(state.chatroomId);
  useEffect(() => {
    stateChatroomIdRef.current = state.chatroomId;
  }, [state.chatroomId]);
  useEffect(
    () => () => {
      if (stateChatroomIdRef.current === chatroomId) actions.closeRoom();
    },
    [actions, chatroomId],
  );
  useEffect(() => {
    if (state.chatroomId === chatroomId && state.accessLost)
      router.replace("/");
  }, [state.chatroomId, state.accessLost, chatroomId, router]);
  const conversation = useMemo(
    () => toChatConversation(state, actions, principal?.userId ?? ""),
    [state, actions, principal?.userId],
  );
  const controller = useMemo(
    () => ({
      send: ({
        body,
        clearDraft,
        onCommitted,
        media,
      }: Readonly<{
        body: string;
        clearDraft: () => void;
        onCommitted?: (localId: string) => void;
        media?: readonly ConnectedPendingAttachment[];
      }>) =>
        new Promise<Readonly<{ outcome: "committed" | "empty" }>>((resolve) => {
          if (focused.current !== chatroomId) {
            resolve({ outcome: "empty" });
            return;
          }
          void actions
            .sendMessage(
              body,
              (id) => {
                if (focused.current === chatroomId) {
                  clearDraft();
                  onCommitted?.(id);
                }
                resolve({ outcome: "committed" });
              },
              media,
            )
            .then(
              () => resolve({ outcome: "empty" }),
              () => resolve({ outcome: "empty" }),
            );
        }),
    }),
    [actions, chatroomId],
  );
  if (!valid || !ready || state.chatroomId !== chatroomId || state.accessLost) {
    const isError =
      !valid || state.accessLost || account.state?.status === "error";
    const message = !valid
      ? "올바르지 않은 대화 주소입니다."
      : state.accessLost
        ? "이 대화에 접근할 수 없습니다."
        : account.state?.status === "error"
          ? "대화 저장소를 열지 못했습니다."
          : "대화 준비 중…";
    return (
      <AppScreen backgroundColor={colors.background}>
        <InlineMessage kind={isError ? "error" : "notice"} message={message}>
          {account.state?.status === "error" ? (
            <NativeButton
              label="저장소 다시 열기"
              onPress={account.retry}
              variant="text"
            />
          ) : null}
        </InlineMessage>
      </AppScreen>
    );
  }
  return (
    <ChatConversationScreen
      key={JSON.stringify([principal?.userId, principal?.epoch, chatroomId])}
      title={titleResolution.title}
      onTitlePress={onTitlePress}
      titleAccessibilityHint={
        titleResolution.kind === "main"
          ? "그룹 정보를 엽니다"
          : titleResolution.kind === "topic"
            ? "주제 상세를 엽니다"
            : undefined
      }
      subtitle={
        state.sync === "connecting"
          ? "동기화 중…"
          : state.sync === "offline"
            ? "오프라인 · 기기에 저장 후 자동 전송"
            : undefined
      }
      conversation={conversation}
      controller={controller}
      attachmentController={attachments}
      revealInitialLatest
      blocked={
        state.send.status === "pending" ||
        state.history.status === "loading" ||
        state.sync === "upgrade-required" ||
        state.sync === "unauthorized"
      }
      onRetryFailedMessage={({ clientMsgId, conversationId }) => {
        if (focused.current === chatroomId && conversationId === chatroomId)
          void actions.retryMessage(clientMsgId);
      }}
      onVisibleCanonicalMessages={(ids) => {
        if (focused.current === chatroomId)
          void actions.markVisibleMessages(ids);
      }}
      footer={
        <>
          {state.sync === "upgrade-required" && (
            <InlineMessage
              kind="error"
              message="앱 업데이트가 필요합니다. 전송 대기 중인 메시지는 기기에 보관됩니다."
            />
          )}
          {state.sync === "unauthorized" && (
            <InlineMessage
              kind="error"
              message="로그인을 다시 확인해 주세요. 전송 대기 중인 메시지는 기기에 보관됩니다."
            />
          )}
          {(state.send.status === "failed" ||
            state.send.status === "uncertain") && (
            <InlineMessage
              kind="error"
              message={chatErrorMessage(state.send.errorCode)}
            />
          )}
          {state.read.status === "error" && (
            <InlineMessage
              kind="error"
              message="읽음 처리를 반영하지 못했습니다. 메시지 조회와 전송은 계속 사용할 수 있습니다."
            >
              <NativeButton
                label="읽음 처리 다시 시도"
                onPress={() => void actions.retryRead()}
                variant="text"
              />
            </InlineMessage>
          )}
        </>
      }
    />
  );
}
