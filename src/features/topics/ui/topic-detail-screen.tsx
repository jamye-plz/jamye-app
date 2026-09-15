import { BottomSheet, Host, List, ListItem } from "@expo/ui";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";

import type { Topic, TopicTag } from "@/core/contracts/server";
import type { UploadFinalizeResult } from "@/core/contracts/server/media";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { useMediaUploadQueue } from "@/features/media/model/use-media-upload-queue";
import { TopicImageUploadButton } from "@/features/media/ui/topic-image-upload-button";
import { TopicMediaList } from "@/features/media/ui/topic-media-list";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";
import { FormField } from "@/shared/ui/form-field";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { HeaderIconButton } from "@/shared/ui/header-icon-button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";

import {
  isTopicPatch,
  isTopicTags,
  type TopicTagInput,
} from "../model/topics-input";
import type { TopicsStore } from "../model/topics-store";
import { TopicError } from "./topic-controls";
import { useTopicScreen } from "./use-topic-screen";

type EditMode = "body" | "tags" | null;

export function TopicDetailScreen({
  groupId,
  topicId,
}: Readonly<{
  groupId: string;
  topicId: string;
}>) {
  const { colors } = useAppTheme();
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
  const detailReady = detail?.status === "ready" && topic !== undefined;
  const canEdit = detailReady && state.permissions.canEdit;
  const canManageTags = detailReady && state.permissions.canManageTags;
  const [mediaRefreshToken, setMediaRefreshToken] = useState(0);
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<EditMode>(null);
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
    <>
      <Stack.Screen
        options={{
          headerRight:
            canEdit || canManageTags
              ? () => (
                  <HeaderIconButton
                    accessibilityLabel="주제 편집 메뉴"
                    onPress={() => setMenu(true)}
                    symbol="more"
                  />
                )
              : undefined,
          title: "주제",
        }}
      />
      <AppScreen
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              if (state.mutation.status !== "pending" && !state.editing)
                void store?.actions.refreshDetail();
            }}
            refreshing={detail?.status === "loading"}
            tintColor={colors.primary as string}
          />
        }
      >
        {!screen.valid ? (
          <AppText>올바르지 않은 주제 주소입니다.</AppText>
        ) : !screen.ready ? (
          <AppText color={colors.textMuted}>주제 저장소 준비 중…</AppText>
        ) : state.accessLost ? (
          <TopicError error={state.error} />
        ) : (
          <>
            {detail?.status === "loading" ? (
              <InlineMessage kind="notice" message="주제 상세 불러오는 중…" />
            ) : null}
            <TopicError error={detail?.error ?? null} />
            {topic && store && detail?.status === "ready" ? (
              <>
                <AppText accessibilityRole="header" variant="title">
                  {topic.title}
                </AppText>
                <AppText color={colors.textMuted} variant="subheadline">
                  작성자 {topic.authorNickname}
                </AppText>
                <AppText selectable variant="body">
                  {topic.body ?? "아직 본문이 없는 새 주제입니다."}
                </AppText>
                {detail.tags.length ? (
                  <View style={styles.chipRow}>
                    {detail.tags.map((tag) => (
                      <View
                        key={tag.tag}
                        style={[styles.chip, { backgroundColor: colors.fill }]}
                      >
                        <AppText variant="caption">#{tag.tag}</AppText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <AppText color={colors.textMuted} variant="footnote">
                    태그 없음
                  </AppText>
                )}
                <NativeButton
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
                  mode={mode}
                  setMode={setMode}
                  store={store}
                  tags={detail.tags}
                  topic={topic}
                />
                <GroupedSection title="주제 이미지">
                  <TopicImageUploadButton
                    canManage={canManageImage}
                    controller={imageUpload}
                  />
                  <TopicMediaList key={mediaRefreshToken} topicId={topicId} />
                </GroupedSection>
              </>
            ) : null}
          </>
        )}
      </AppScreen>
      <Host>
        <BottomSheet isPresented={menu} onDismiss={() => setMenu(false)}>
          <List>
            {canEdit ? (
              <ListItem
                onPress={() => {
                  store?.actions.clearMutation();
                  setMode("body");
                  setMenu(false);
                }}
              >
                <AppText>제목·본문 편집</AppText>
              </ListItem>
            ) : null}
            {canManageTags ? (
              <ListItem
                onPress={() => {
                  store?.actions.clearMutation();
                  setMode("tags");
                  setMenu(false);
                }}
              >
                <AppText>태그 편집</AppText>
              </ListItem>
            ) : null}
          </List>
        </BottomSheet>
      </Host>
    </>
  );
}

function TopicEditing({
  mode,
  setMode,
  store,
  tags,
  topic,
}: Readonly<{
  mode: EditMode;
  setMode: (mode: EditMode) => void;
  store: TopicsStore;
  tags: readonly TopicTag[];
  topic: Topic;
}>) {
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
        <InlineMessage kind="notice" message="저장했습니다." />
      ) : null}
      {mode === "body" && permissions.canEdit ? (
        <BodyEditor close={() => setMode(null)} store={store} topic={topic} />
      ) : mode === "tags" && permissions.canManageTags ? (
        <TagsEditor close={() => setMode(null)} store={store} tags={tags} />
      ) : null}
    </>
  );
}

function BodyEditor({
  close,
  store,
  topic,
}: Readonly<{ close: () => void; store: TopicsStore; topic: Topic }>) {
  const { colors } = useAppTheme();
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
    <View style={styles.gap}>
      <FormField
        editable={!busy}
        label="주제 제목 수정"
        onChangeText={setTitle}
        value={title}
      />
      <FormField
        editable={!busy}
        label="주제 본문"
        multiline
        onChangeText={setBody}
        value={body}
      />
      <AppText color={colors.textMuted} variant="footnote">
        본문을 비우는 기능은 지원하지 않습니다. 줄바꿈은 입력되고 저장
        버튼으로만 반영됩니다.
      </AppText>
      <NativeButton
        busy={busy}
        disabled={!valid}
        label="제목·본문 저장"
        onPress={() =>
          void store.actions.edit(patch).then(() => {
            if (store.getState().mutation.status === "succeeded") close();
          })
        }
      />
      <NativeButton
        disabled={busy}
        label="편집 취소"
        onPress={close}
        variant="text"
      />
    </View>
  );
}

function TagsEditor({
  close,
  store,
  tags,
}: Readonly<{
  close: () => void;
  store: TopicsStore;
  tags: readonly TopicTag[];
}>) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<readonly TopicTagInput[]>(() =>
    tags.map(({ tag, source, confidence }) => ({ tag, source, confidence })),
  );
  const [input, setInput] = useState("");
  const busy = store.getState().mutation.status === "pending";
  const next = [...draft, { tag: input, source: "user" as const }];
  return (
    <View style={styles.gap}>
      <AppText color={colors.textMuted} variant="footnote">
        태그 전체 목록을 저장합니다. 기존 태그의 출처는 유지되며 새 태그는 직접
        입력한 태그로 등록됩니다.
      </AppText>
      <View style={styles.chipRow}>
        {draft.map((tag) => (
          <Pressable
            key={tag.tag}
            accessibilityLabel={`${tag.tag} 태그 제거`}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() =>
              setDraft(draft.filter((item) => item.tag !== tag.tag))
            }
            style={[styles.chip, { backgroundColor: colors.fill }]}
          >
            <AppText variant="caption">{tag.tag} ×</AppText>
          </Pressable>
        ))}
      </View>
      <FormField
        editable={!busy}
        label="새 태그"
        onChangeText={setInput}
        value={input}
      />
      <NativeButton
        disabled={busy || !isTopicTags(next)}
        label="태그 추가"
        onPress={() => {
          setDraft([
            ...draft,
            { tag: input.trim(), source: "user", confidence: null },
          ]);
          setInput("");
        }}
        variant="text"
      />
      {!draft.length ? (
        <AppText color={colors.textMuted} variant="footnote">
          저장하면 모든 태그가 제거됩니다.
        </AppText>
      ) : null}
      <NativeButton
        busy={busy}
        disabled={!isTopicTags(draft) || input.trim().length > 0}
        label="태그 전체 저장"
        onPress={() =>
          void store.actions.saveTags(draft).then(() => {
            if (store.getState().mutation.status === "succeeded") close();
          })
        }
      />
      <NativeButton
        disabled={busy}
        label="태그 편집 취소"
        onPress={close}
        variant="text"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderCurve: "continuous",
    borderRadius: 999,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: appSpacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appSpacing.xs,
  },
  gap: { gap: appSpacing.sm },
});
