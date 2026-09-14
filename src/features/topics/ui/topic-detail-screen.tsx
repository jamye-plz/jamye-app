import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import type { Topic, TopicTag } from "@/core/contracts/server";
import type { UploadFinalizeResult } from "@/core/contracts/server/media";
import { TopicMediaList } from "@/features/media/ui/topic-media-list";
import { TopicImageUploadButton } from "@/features/media/ui/topic-image-upload-button";
import { useMediaUploadQueue } from "@/features/media/model/use-media-upload-queue";
import {
  isTopicPatch,
  isTopicTags,
  type TopicTagInput,
} from "../model/topics-input";
import type { TopicsStore } from "../model/topics-store";
import {
  TopicText as AppText,
  TopicButton,
  TopicError,
  TopicField,
  TopicLayout,
  topicStyles,
} from "./topic-controls";
import { useTopicScreen } from "./use-topic-screen";

export function TopicDetailScreen({
  groupId,
  topicId,
}: Readonly<{
  groupId: string;
  topicId: string;
}>) {
  const screen = useTopicScreen(groupId, topicId);
  const { state, store } = screen;
  const detail =
    screen.scoped && state.detail.id === topicId ? state.detail : null;
  const topic = detail?.topic;
  // MD1/MD2 use the same topic-author OR live-group-owner rule as T7 tags.
  const canManageImage =
    state.permissions.canManageTags &&
    detail?.status === "ready" &&
    topic?.id === topicId;
  const [mediaRefreshToken, setMediaRefreshToken] = useState(0);
  const isScreenCurrent = screen.current;
  const onImageConfirmed = useCallback(
    (result: UploadFinalizeResult) => {
      const latest = store?.getState();
      if (
        !isScreenCurrent() ||
        !latest ||
        latest.accessLost ||
        latest.detail.topic?.id !== topicId ||
        !latest.permissions.canManageTags ||
        result.scope !== "topic" ||
        result.topicMedia.topicId !== topicId
      )
        return;
      setMediaRefreshToken((value) => value + 1);
      void store?.actions.refreshDetail();
    },
    [store, topicId, isScreenCurrent],
  );
  const imageUpload = useMediaUploadQueue(
    "topic",
    topicId,
    canManageImage && screen.ready && !state.accessLost,
    onImageConfirmed,
  );
  return (
    <TopicLayout>
      <TopicButton
        secondary
        label="주제 목록으로"
        onPress={screen.backToTopics}
      />
      {!screen.valid ? (
        <AppText>올바르지 않은 주제 주소입니다.</AppText>
      ) : !screen.ready ? (
        <AppText>주제 저장소 준비 중…</AppText>
      ) : state.accessLost ? (
        <TopicError error={state.error} />
      ) : (
        <>
          {detail?.status === "loading" ? (
            <AppText>주제 상세 불러오는 중…</AppText>
          ) : null}
          <TopicError error={detail?.error ?? null} />
          <TopicButton
            secondary
            label="주제 상세 새로고침"
            disabled={state.mutation.status === "pending" || state.editing}
            busy={detail?.status === "loading"}
            onPress={() => void store?.actions.refreshDetail()}
          />
          {topic && store && detail.status === "ready" ? (
            <>
              <AppText variant="title" accessibilityRole="header">
                {topic.title}
              </AppText>
              <AppText>작성자 {topic.authorNickname}</AppText>
              <AppText>
                {topic.body ?? "아직 본문이 없는 새 주제입니다."}
              </AppText>
              <AppText>
                {detail.tags.length
                  ? detail.tags.map((tag) => `#${tag.tag}`).join(" ")
                  : "태그 없음"}
              </AppText>
              <TopicButton
                label="이 주제에서 대화하기"
                onPress={() => {
                  if (
                    screen.current() &&
                    store.getState().detail.topic?.id === topicId
                  )
                    screen.router.push({
                      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
                      params: { groupId, chatroomId: topic.chatroomId },
                    });
                }}
              />
              <TopicEditing
                key={topic.id}
                store={store}
                topic={topic}
                tags={detail.tags}
              />
              <AppText variant="label">주제 이미지</AppText>
              <TopicImageUploadButton
                canManage={canManageImage}
                controller={imageUpload}
              />
              <TopicMediaList key={mediaRefreshToken} topicId={topicId} />
            </>
          ) : null}
        </>
      )}
    </TopicLayout>
  );
}
function TopicEditing({
  store,
  topic,
  tags,
}: Readonly<{ store: TopicsStore; topic: Topic; tags: readonly TopicTag[] }>) {
  const [mode, setMode] = useState<"body" | "tags" | null>(null);
  const { permissions, mutation } = store.getState();
  useEffect(() => {
    store.actions.setEditing(
      (mode === "body" && permissions.canEdit) ||
        (mode === "tags" && permissions.canManageTags),
    );
    return () => store.actions.setEditing(false);
  }, [mode, permissions.canEdit, permissions.canManageTags, store]);
  return (
    <>
      <TopicError error={mutation.error} />
      {mutation.status === "succeeded" ? (
        <AppText accessibilityLiveRegion="polite">저장했습니다.</AppText>
      ) : null}
      {mode === "body" && permissions.canEdit ? (
        <BodyEditor topic={topic} store={store} close={() => setMode(null)} />
      ) : mode === "tags" && permissions.canManageTags ? (
        <TagsEditor tags={tags} store={store} close={() => setMode(null)} />
      ) : (
        <>
          {permissions.canEdit ? (
            <TopicButton
              secondary
              label="제목·본문 편집"
              onPress={() => {
                store.actions.clearMutation();
                setMode("body");
              }}
            />
          ) : null}
          {permissions.canManageTags ? (
            <TopicButton
              secondary
              label="태그 편집"
              onPress={() => {
                store.actions.clearMutation();
                setMode("tags");
              }}
            />
          ) : null}
        </>
      )}
    </>
  );
}
function BodyEditor({
  topic,
  store,
  close,
}: Readonly<{ topic: Topic; store: TopicsStore; close: () => void }>) {
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.body ?? "");
  const patch = {
    ...(title !== topic.title ? { title } : {}),
    ...(body !== (topic.body ?? "") ? { body } : {}),
  };
  const valid =
    (title !== topic.title || body !== (topic.body ?? "")) &&
    isTopicPatch(patch);
  const busy = store.getState().mutation.status === "pending";
  return (
    <>
      <TopicField
        label="주제 제목 수정"
        value={title}
        onChangeText={setTitle}
        editable={!busy}
      />
      <TopicField
        label="주제 본문"
        value={body}
        onChangeText={setBody}
        multiline
        editable={!busy}
      />
      <AppText>
        본문을 비우는 기능은 지원하지 않습니다. 줄바꿈은 입력되고 저장
        버튼으로만 반영됩니다.
      </AppText>
      <TopicButton
        label="제목·본문 저장"
        busy={busy}
        disabled={!valid}
        onPress={() =>
          void store.actions.edit(patch).then(() => {
            if (store.getState().mutation.status === "succeeded") close();
          })
        }
      />
      <TopicButton
        secondary
        label="편집 취소"
        disabled={busy}
        onPress={close}
      />
    </>
  );
}
function TagsEditor({
  tags,
  store,
  close,
}: Readonly<{
  tags: readonly TopicTag[];
  store: TopicsStore;
  close: () => void;
}>) {
  const [draft, setDraft] = useState<readonly TopicTagInput[]>(() =>
    tags.map(({ tag, source, confidence }) => ({ tag, source, confidence })),
  );
  const [input, setInput] = useState("");
  const busy = store.getState().mutation.status === "pending";
  const next = [...draft, { tag: input, source: "user" as const }];
  return (
    <>
      <AppText>
        태그 전체 목록을 저장합니다. 기존 태그의 출처는 유지되며 새 태그는 직접
        입력한 태그로 등록됩니다.
      </AppText>
      <View style={topicStyles.gap}>
        {draft.map((tag) => (
          <TopicButton
            key={tag.tag}
            secondary
            label={`${tag.tag} 태그 제거`}
            disabled={busy}
            onPress={() =>
              setDraft(draft.filter((item) => item.tag !== tag.tag))
            }
          />
        ))}
      </View>
      <TopicField
        label="새 태그"
        value={input}
        onChangeText={setInput}
        editable={!busy}
      />
      <TopicButton
        secondary
        label="태그 추가"
        disabled={busy || !isTopicTags(next)}
        onPress={() => {
          setDraft([
            ...draft,
            { tag: input.trim(), source: "user", confidence: null },
          ]);
          setInput("");
        }}
      />
      {!draft.length ? (
        <AppText>저장하면 모든 태그가 제거됩니다.</AppText>
      ) : null}
      <TopicButton
        label="태그 전체 저장"
        busy={busy}
        disabled={!isTopicTags(draft) || input.trim().length > 0}
        onPress={() =>
          void store.actions.saveTags(draft).then(() => {
            if (store.getState().mutation.status === "succeeded") close();
          })
        }
      />
      <TopicButton
        secondary
        label="태그 편집 취소"
        disabled={busy}
        onPress={close}
      />
    </>
  );
}
