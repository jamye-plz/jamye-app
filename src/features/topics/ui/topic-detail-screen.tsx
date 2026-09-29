import { Host } from "@expo/ui";
import {
  Icon,
  IconButton,
  Text as ComposeText,
  TextButton,
} from "@expo/ui/jetpack-compose";
import { Stack, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import type { ImageSourcePropType } from "react-native";

import { useAppTheme, useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors, appSpacing } from "@/core/theme/tokens";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";
import { Avatar } from "@/shared/ui/avatar";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { HeaderActions } from "@/shared/ui/header-actions";
import { StandardStateView } from "@/shared/ui/standard-state-view";

import { showGroupHome } from "@/features/groups/ui/show-group-home";
import { TopicMediaGallery } from "@/features/media/ui/topic-media-gallery";

import { topicDeleteConfirmCopy } from "../model/topic-delete-confirm-copy";
import { topicCreatedAtLabel } from "../model/topics-dates";
import { TOPICS_ERROR_MESSAGES, TopicError } from "./topic-controls";
import { TopicEditForm } from "./topic-edit-form";
import type {
  TopicEditFormRef,
  TopicEditFormSaveInput,
} from "./topic-edit-form.types";
import { useCloseEditOnBack } from "./use-close-edit-on-back";
import { TopicTagsView } from "./topic-tags-view";
import { useTopicScreen } from "./use-topic-screen";

const AVATAR_SIZE = 44;
const IS_ANDROID = process.env.EXPO_OS === "android";
const CLOSE_ICON =
  require("../../../../assets/icons/material/close.xml") as ImageSourcePropType;

/**
 * Topic detail (D1-D3, D6; M15 AC2/AC4/AC6): article header (title, author
 * avatar/name/date, body) + a read-only tag section, and D2's single
 * integrated edit screen toggled in place (not a separate route/modal) so
 * the native top app bar's own left/right slots can host `취소`/`저장` --
 * `Stack.Toolbar` on iOS, `Stack.Screen`'s `headerLeft`/`headerRight` on
 * Android. Outside editing, an author sees a `HeaderActions` menu (편집/삭제,
 * M15 AC4) instead of a standalone edit button; a non-author sees neither
 * (E11). A `topic.deleted` event or a topic-detail 404 replaces the article
 * with the "삭제된 주제입니다." state instead (M15 AC2/AC6/E5). `이 주제에서
 * 대화하기`, the old ⋮ menu, and the inline body/tags editors are gone
 * (D6/D2); topic images are gone (D5, task-app-gallery owns the
 * contract/API side).
 */
export function TopicDetailScreen({
  groupId,
  topicId,
}: Readonly<{
  groupId: string;
  topicId: string;
}>) {
  const { colors } = useAppTheme();
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const router = useRouter();
  const screen = useTopicScreen(groupId, topicId);
  const { state, store } = screen;
  const detail =
    screen.scoped && state.detail.id === topicId ? state.detail : null;
  const topic = detail?.topic;
  const detailReady = detail?.status === "ready" && topic !== undefined;
  const canEditBody = detailReady && state.permissions.canEdit;
  const canEditTags = detailReady && state.permissions.canManageTags;
  const canEditAnything = canEditBody || canEditTags;
  const editing = state.editing && detailReady;
  const busy = state.mutation.status === "pending";
  const [canSave, setCanSave] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const formRef = useRef<TopicEditFormRef>(null);

  const openEdit = () => {
    store?.actions.clearMutation();
    setCanSave(false);
    store?.actions.setEditing(true);
  };
  const closeEdit = () => {
    store?.actions.setEditing(false);
    setCanSave(false);
  };
  useCloseEditOnBack(editing, () => {
    if (!busy) closeEdit();
  });
  const handleSave = () => formRef.current?.submit();
  const handleSubmit = (input: TopicEditFormSaveInput) => {
    if (!store) return;
    void (async () => {
      if (input.patch) {
        await store.actions.edit(input.patch);
        if (store.getState().mutation.status !== "succeeded") return;
      }
      if (input.tags) {
        await store.actions.saveTags(input.tags);
        if (store.getState().mutation.status !== "succeeded") return;
      }
      closeEdit();
    })();
  };

  const mutationErrorText =
    (state.mutation.status === "error" ||
      state.mutation.status === "uncertain") &&
    state.mutation.error
      ? TOPICS_ERROR_MESSAGES[state.mutation.error]
      : undefined;
  // M15/AC8 (coordinator review, r4): a failed delete from this screen's own
  // header-menu flow (the ConfirmAlert below) used to be silent outside
  // editing -- `mutationErrorText` above only ever reaches `TopicEditForm`'s
  // `errorText`, which isn't mounted here. `!editing` keeps this out of the
  // form's way (that already shows `mutationErrorText`); reading straight
  // from `state.mutation` (not local state) means it clears itself the
  // instant any later mutation starts (`startMutation` always resets
  // `error: null`) or succeeds, exactly like `mutationErrorText` already
  // does for the edit form.
  const deleteMutationError =
    !editing &&
    state.mutation.kind === "delete" &&
    (state.mutation.status === "error" ||
      state.mutation.status === "uncertain") &&
    state.mutation.error
      ? state.mutation.error
      : null;

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft:
            IS_ANDROID && editing
              ? () => (
                  <Host matchContents seedColor={hex.primary}>
                    <IconButton enabled={!busy} onClick={closeEdit}>
                      <Icon
                        contentDescription="취소"
                        size={24}
                        source={CLOSE_ICON}
                        tint={hex.text}
                      />
                    </IconButton>
                  </Host>
                )
              : undefined,
          headerRight:
            IS_ANDROID && editing
              ? () => (
                  <Host matchContents seedColor={hex.primary}>
                    <TextButton enabled={canSave && !busy} onClick={handleSave}>
                      <ComposeText
                        color={canSave && !busy ? hex.primary : hex.textMuted}
                      >
                        저장
                      </ComposeText>
                    </TextButton>
                  </Host>
                )
              : undefined,
          title: editing ? "주제 편집" : "주제",
        }}
      />
      {!IS_ANDROID && editing ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              accessibilityLabel="취소"
              disabled={busy}
              onPress={closeEdit}
            >
              취소
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              accessibilityLabel="저장"
              disabled={!canSave || busy}
              onPress={handleSave}
              variant="done"
            >
              저장
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      ) : !editing ? (
        // M15/AC4/E11 (device round r2): always render HeaderActions while
        // not editing -- even with an empty menu (deleted state / non-author,
        // canEditAnything false) -- instead of unmounting it. Android's
        // header-actions.android.tsx sets `headerRight` through its own
        // `<Stack.Screen>`; expo-router keeps the *last* headerRight a
        // `<Stack.Screen>` ever set once that call stops re-rendering, so
        // unmounting this component (the old `canEditAnything &&` gate) left
        // a stale 편집/삭제 menu behind after delete. An empty `actions`
        // array makes header-actions.android.tsx set `headerRight: undefined`
        // itself, actually clearing it (see its `actions.length > 0 ? … :
        // undefined`). iOS render path is unchanged; author-only menu
        // content (E11) is unchanged.
        <HeaderActions
          actions={
            canEditAnything
              ? [
                  {
                    accessibilityLabel: "주제 메뉴",
                    disabled: busy,
                    items: [
                      {
                        key: "edit",
                        onPress: openEdit,
                        symbol: "edit",
                        title: "편집",
                      },
                      {
                        destructive: true,
                        key: "delete",
                        onPress: () => setConfirmingDelete(true),
                        symbol: "delete",
                        title: "삭제",
                      },
                    ],
                    key: "topic-menu",
                    kind: "menu",
                    symbol: "more",
                  },
                ]
              : []
          }
        />
      ) : null}
      <AppScreen
        refreshControl={
          editing ? undefined : (
            <RefreshControl
              onRefresh={() => {
                if (state.mutation.status !== "pending")
                  void store?.actions.refreshDetail();
              }}
              refreshing={detail?.status === "loading"}
            />
          )
        }
      >
        {!screen.valid ? (
          <AppText>올바르지 않은 주제 주소입니다.</AppText>
        ) : !screen.ready ? (
          <AppText color={colors.textMuted}>주제 저장소 준비 중…</AppText>
        ) : state.accessLost ? (
          <TopicError error={state.error} />
        ) : detail?.status === "deleted" ? (
          // M15/AC2/AC6/E5: topic.deleted or a topic-detail 404 either way;
          // back stays enabled (the nav stack, untouched), any composer is
          // the topic chatroom's own concern (task-app-chat).
          <Host matchContents={{ vertical: true }} seedColor={colors.primary}>
            <StandardStateView
              kind="deleted"
              systemImage="delete"
              testID="topic-detail-deleted"
              title="삭제된 주제입니다."
            />
          </Host>
        ) : detail?.status === "loading" && !topic ? (
          // State views are SwiftUI/Compose nodes and need their own Host.
          <Host matchContents={{ vertical: true }} seedColor={colors.primary}>
            <StandardStateView kind="loading" testID="topic-detail-loading" />
          </Host>
        ) : detail?.status === "error" && !topic ? (
          <Host matchContents={{ vertical: true }} seedColor={colors.primary}>
            <StandardStateView
              actions={[
                {
                  label: "다시 시도",
                  onPress: () => void store?.actions.refreshDetail(),
                  primary: true,
                },
              ]}
              description={
                detail.error ? TOPICS_ERROR_MESSAGES[detail.error] : undefined
              }
              kind="error"
              systemImage="error"
              testID="topic-detail-error"
              title="주제를 불러오지 못했습니다."
            />
          </Host>
        ) : topic && store && detail ? (
          <>
            <TopicError error={detail.error} />
            <TopicError error={deleteMutationError} />
            {editing ? (
              <TopicEditForm
                busy={busy}
                canEditBody={canEditBody}
                canEditTags={canEditTags}
                errorText={mutationErrorText}
                key={topic.id}
                onCancel={closeEdit}
                onSave={handleSubmit}
                onValidityChange={setCanSave}
                ref={formRef}
                tags={detail.tags}
                testID="topic-edit-form"
                topic={topic}
              />
            ) : (
              <View style={styles.article} testID="topic-article">
                <AppText accessibilityRole="header" variant="title">
                  {topic.title}
                </AppText>
                <View style={styles.byline}>
                  <Avatar
                    name={topic.authorNickname}
                    size={AVATAR_SIZE}
                    uri={topic.authorAvatarUrl}
                  />
                  <View style={styles.bylineText}>
                    <AppText>{topic.authorNickname}</AppText>
                    <AppText color={colors.textMuted} variant="footnote">
                      {topicCreatedAtLabel(topic.createdAt)}
                    </AppText>
                  </View>
                </View>
                <AppText selectable variant="body">
                  {topic.body ?? "아직 본문이 없는 새 주제입니다."}
                </AppText>
                <GroupedSection title="태그">
                  <TopicTagsView tags={detail.tags} testID="topic-tags-view" />
                </GroupedSection>
                <TopicMediaGallery
                  chatroomId={topic.chatroomId}
                  groupId={groupId}
                  topicId={topicId}
                />
              </View>
            )}
          </>
        ) : null}
      </AppScreen>
      {/* ConfirmAlert is a native alert and needs its own Host (DESIGN.md §4);
          without it Android rejects the AlertDialog outright. */}
      <Host matchContents seedColor={colors.primary}>
        <ConfirmAlert
          {...topicDeleteConfirmCopy()}
          destructive
          isPresented={confirmingDelete}
          onConfirm={() => {
            setConfirmingDelete(false);
            void (async () => {
              // M15/AC8 (r2-17, device re-check 2026-09-29): the author's
              // own delete (this header-menu -> ConfirmAlert flow) used to
              // leave the now-dead detail (and chatroom, if that's how it
              // was reached) showing "삭제된 주제입니다." instead of going
              // back. On a successful T8, go straight to the group's topic
              // list -- `showGroupHome`'s `dismissTo` pops every pushed
              // root-stack screen (detail, and the chatroom under it) back
              // to the group home, and seeds the stack when the list isn't
              // already underneath (e.g. opened from the notifications
              // inbox). A failed T8 is unchanged: stay on the detail, no
              // navigation. Other members' open detail/chatroom still reach
              // the "삭제된 주제입니다." state through the unrelated
              // `topic.deleted`/404 path above, not this handler.
              const deleted = await store?.actions.deleteTopic(topicId);
              if (deleted) showGroupHome(router, groupId);
            })();
          }}
          onDismiss={() => setConfirmingDelete(false)}
          testID="topic-detail-delete-confirm"
        />
      </Host>
    </>
  );
}

const styles = StyleSheet.create({
  article: { gap: appSpacing.md },
  byline: { alignItems: "center", flexDirection: "row", gap: appSpacing.sm },
  bylineText: { gap: 2 },
});
