import { Host } from "@expo/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/core/providers/session-provider";
import { useAccountScope } from "@/core/providers/app-providers";
import { useAppTheme } from "@/core/theme/theme-provider";
import { useMediaUploadQueue } from "@/features/media/model/use-media-upload-queue";
import { useTopics } from "@/features/topics/model/topics-provider";
import { AppScreen } from "@/shared/ui/app-screen";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";
import { StandardStateView } from "@/shared/ui/standard-state-view";
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
  // M15 device round r2 follow-up (root cause A): either the open room's own
  // room-scoped loss (a topic room's eviction/`membership_required`) or a
  // group-wide loss blocks this room the same way -- see
  // connected-chat-store.ts's `accessLostPatch` for which evidence sets
  // which field.
  const anyAccessLost = state.accessLost || state.roomAccessLost;
  const attachments = useMediaUploadQueue(
    "chat",
    chatroomId,
    valid && ready && state.chatroomId === chatroomId && !anyAccessLost,
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
  const topics = useTopics();
  // M15/AC2/AC6/E3/E5 (root cause #2-#4, device round r2): the server 403s a
  // deleted topic's chatroom delta as plain `membership_required` (delta.rs)
  // -- indistinguishable from a real membership loss by status code alone --
  // and connected-chat-store.ts's onConversationEvicted then drops this room
  // from state.rooms.items, the only place its `kind`/`topicId` otherwise
  // lives. Captured here *before* any eviction, per chatroomId (independent
  // of useChatroomTitle's own title-display "unresolved" state, which also
  // reports "unresolved" while a *known* topic room's title is merely still
  // loading -- a different concern), so this screen can keep asking
  // topics-store which of the two causes this is instead of guessing.
  // Cleared only when a *different* chatroomId is requested.
  const liveTopicId = state.rooms.items.find(
    (room) => room.chatroomId === chatroomId && room.kind === "topic",
  )?.topicId;
  const [stickyTopicRoom, setStickyTopicRoom] = useState<{
    chatroomId: string;
    topicId: string;
  } | null>(null);
  // Adjust state while rendering (React's documented pattern for deriving
  // state from a changed input) instead of a useEffect: a ref write here
  // would not schedule a re-render, so on the very render `liveTopicId`
  // first becomes non-null, a ref-based version of this value would still
  // read as null -- exactly backwards from what the redirect-gate effect
  // below and the render branch need on *this* render, not one later.
  if (
    liveTopicId &&
    (stickyTopicRoom?.chatroomId !== chatroomId ||
      stickyTopicRoom.topicId !== liveTopicId)
  ) {
    setStickyTopicRoom({ chatroomId, topicId: liveTopicId });
  } else if (
    !liveTopicId &&
    stickyTopicRoom !== null &&
    stickyTopicRoom.chatroomId !== chatroomId
  ) {
    setStickyTopicRoom(null);
  }
  const stickyTopicId =
    liveTopicId ??
    (stickyTopicRoom?.chatroomId === chatroomId
      ? stickyTopicRoom.topicId
      : null);
  const topicDetail = topics.state.detail;
  // T8's own success or a `topic.deleted` event may already have told
  // topics-store this exact topic is gone -- order-independent: this can
  // turn true before `state.accessLost` ever flips (M15 "순서 무관").
  const topicConfirmedDeleted =
    stickyTopicId !== null &&
    topicDetail.id === stickyTopicId &&
    topicDetail.status === "deleted";
  // A genuine membership loss (topic still alive, real 403): resolved either
  // at the topics-group level or as this specific topic query's own error.
  const topicConfirmedForbidden =
    stickyTopicId !== null &&
    (topics.state.accessLost ||
      (topicDetail.id === stickyTopicId && topicDetail.status === "error"));
  const evictionRecheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.chatroomId !== chatroomId || !anyAccessLost) {
      evictionRecheckedRef.current = null;
      return;
    }
    if (topicConfirmedDeleted) return; // AC2/AC6: stay put, the render branch below shows the deleted state.
    if (!stickyTopicId || topicConfirmedForbidden) {
      router.replace("/"); // Main room, or a topic room with a *confirmed* real membership loss (M14 unchanged).
      return;
    }
    // Eviction fired before topics-store otherwise learned of a delete: ask
    // it directly rather than guess. topics-store.ts's loadDetail() maps a
    // 404 to detail.status "deleted" and a genuine 403 membership_required
    // to topics.state.accessLost -- both re-read above on this effect's next
    // run.
    if (evictionRecheckedRef.current === chatroomId) {
      // Already asked once for this eviction and it settled on neither --
      // do not loop forever; fall back to the M14 redirect.
      if (topicDetail.status !== "loading") router.replace("/");
      return;
    }
    if (topics.ready && topicDetail.status !== "loading") {
      evictionRecheckedRef.current = chatroomId;
      void topics.store?.actions.openTopic(groupId, stickyTopicId);
    }
  }, [
    state.chatroomId,
    anyAccessLost,
    chatroomId,
    router,
    stickyTopicId,
    topicConfirmedDeleted,
    topicConfirmedForbidden,
    topics.ready,
    topics.store,
    topicDetail.status,
    groupId,
  ]);
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
  if (valid && topicConfirmedDeleted) {
    // M15/AC2/AC6: stay on this chatroom (no router.replace) regardless of
    // whether this screen instance is currently focused (a topic-detail
    // screen pushed on top leaves this one mounted underneath) -- the same
    // StandardStateView "deleted" kind topic-detail-screen.tsx uses, so both
    // read identically once back navigation returns here. No composer,
    // attachments, or voice entry point renders in this branch (E3).
    return (
      <AppScreen backgroundColor={colors.background}>
        <Host matchContents={{ vertical: true }} seedColor={colors.primary}>
          <StandardStateView
            kind="deleted"
            systemImage="delete"
            testID="chat-topic-deleted"
            title="삭제된 주제입니다."
          />
        </Host>
      </AppScreen>
    );
  }
  if (!valid || !ready || state.chatroomId !== chatroomId || anyAccessLost) {
    const isError =
      !valid || anyAccessLost || account.state?.status === "error";
    const message = !valid
      ? "올바르지 않은 대화 주소입니다."
      : anyAccessLost
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
      onDeleteMessage={({ chatroomId: targetChatroomId, serverMessageId }) => {
        if (focused.current === chatroomId && targetChatroomId === chatroomId)
          void actions.deleteMessage({
            chatroomId: targetChatroomId,
            serverMessageId,
          });
      }}
      onDiscardFailedMessage={({ clientMsgId }) => {
        if (focused.current === chatroomId)
          void actions.discardFailedMessage(clientMsgId);
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
