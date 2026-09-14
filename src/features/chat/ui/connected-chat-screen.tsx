import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/core/providers/session-provider";
import { useAccountScope } from "@/core/providers/app-providers";
import { useAppTheme } from "@/core/theme/theme-provider";
import { useMediaUploadQueue } from "@/features/media/model/use-media-upload-queue";
import { useConnectedChat } from "../model/connected-chat-provider";
import {
  chatErrorMessage,
  isChatIdentifier,
  toChatConversation,
} from "../model/connected-chat-presentation";
import type { ConnectedPendingAttachment } from "../model/connected-chat-presentation";
import { ChatConversationScreen } from "./chat-screen";
import { ChatButton, ChatNotice } from "./chat-controls";

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
        actions.closeRoom();
      };
    }, [actions, chatroomId, ready, valid]),
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
  const back = (
    <ChatButton
      label="주제 목록으로"
      onPress={() =>
        isChatIdentifier(groupId)
          ? router.replace({
              pathname: "/groups/[groupId]/chatrooms",
              params: { groupId },
            })
          : router.replace("/")
      }
    />
  );
  if (!valid || !ready || state.chatroomId !== chatroomId || state.accessLost)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {back}
        <ChatNotice
          message={
            !valid
              ? "올바르지 않은 대화 주소입니다."
              : state.accessLost
                ? "이 대화에 접근할 수 없습니다."
                : account.state?.status === "error"
                  ? "대화 저장소를 열지 못했습니다."
                  : "대화 준비 중…"
          }
          error={
            !valid || state.accessLost || account.state?.status === "error"
          }
        />
        {account.state?.status === "error" && (
          <ChatButton label="저장소 다시 열기" onPress={account.retry} />
        )}
      </SafeAreaView>
    );
  return (
    <ChatConversationScreen
      key={JSON.stringify([principal?.userId, principal?.epoch, chatroomId])}
      title="대화"
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
      toolbar={
        <View>
          {back}
          <ChatButton
            label="메시지 새로고침"
            disabled={state.history.status === "loading"}
            onPress={() => void actions.openRoom(chatroomId)}
          />
        </View>
      }
      footer={
        <>
          {state.sync === "offline" && (
            <ChatNotice message="연결을 기다리는 중입니다. 메시지는 기기에 저장되고 연결되면 자동으로 전송됩니다." />
          )}
          {state.sync === "connecting" && (
            <ChatNotice message="대화를 동기화하는 중…" />
          )}
          {state.sync === "upgrade-required" && (
            <ChatNotice
              error
              message="앱 업데이트가 필요합니다. 전송 대기 중인 메시지는 기기에 보관됩니다."
            />
          )}
          {state.sync === "unauthorized" && (
            <ChatNotice
              error
              message="로그인을 다시 확인해 주세요. 전송 대기 중인 메시지는 기기에 보관됩니다."
            />
          )}
          {(state.send.status === "failed" ||
            state.send.status === "uncertain") && (
            <ChatNotice
              error
              message={chatErrorMessage(state.send.errorCode)}
            />
          )}
          {state.read.status === "error" && (
            <>
              <ChatNotice
                error
                message="읽음 처리를 반영하지 못했습니다. 메시지 조회와 전송은 계속 사용할 수 있습니다."
              />
              <ChatButton
                label="읽음 처리 다시 시도"
                onPress={() => void actions.retryRead()}
              />
            </>
          )}
          {state.read.status === "ready" && (
            <ChatNotice message="읽음 처리를 반영했습니다." />
          )}
        </>
      }
    />
  );
}
