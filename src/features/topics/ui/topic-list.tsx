import { Host } from "@expo/ui";
import { useState } from "react";
import { StyleSheet } from "react-native";

import type { Topic } from "@/core/contracts/server";
import { useAppTheme } from "@/core/theme/theme-provider";
import { ActionListItem } from "@/shared/ui/action-list-item";
import { Avatar } from "@/shared/ui/avatar";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import { LoadSentinel } from "@/shared/ui/load-sentinel";
import { NativeList } from "@/shared/ui/native-list";
import { StandardStateViewErrorRow } from "@/shared/ui/standard-state-view";

import { topicDeleteConfirmCopy } from "../model/topic-delete-confirm-copy";
import type { TopicListProps } from "./topic-list.types";

export type * from "./topic-list.types";

const AVATAR_SIZE = 40;
const IS_IOS = process.env.EXPO_OS === "ios";

/**
 * Topic list (T2, T4; M15/AC3 author-row delete). Tap always opens the
 * topic's chatroom. Author rows (`topic.authorId === currentUserId`)
 * additionally get a destructive delete action through `ActionListItem`:
 * iOS swipe + context menu, Android long-press/⋮ (E11) -- Android
 * deliberately has no swipe (A1). Non-author rows stay tap-only, same as
 * before M15. Leading is the author's avatar (`author_avatar_url` /
 * monogram, T3); the iOS row-moves-forward chevron comes from
 * `ActionListItem`'s own default. Only rendered once there is at least one
 * row: `topics-screen.tsx` shows `StandardStateView` for the
 * loading/empty/error-with-no-rows states instead.
 */
export function TopicList({
  currentUserId,
  loadMore,
  onDeleteConfirmed,
  onOpenChat,
  onRefresh,
  testID,
  topError,
  topics,
}: TopicListProps) {
  const { colors } = useAppTheme();
  const [pendingDelete, setPendingDelete] = useState<Topic | null>(null);
  return (
    <>
      <Host seedColor={colors.primary} style={styles.host}>
        <NativeList onRefresh={onRefresh} testID={testID ?? "topic-list"}>
          {IS_IOS && topError ? (
            <StandardStateViewErrorRow
              message={topError.message}
              onRetry={topError.onRetry}
              testID="topic-list-top-error"
            />
          ) : null}
          {topics.map((topic) => (
            <ActionListItem
              actions={
                currentUserId !== null && topic.authorId === currentUserId
                  ? [
                      {
                        destructive: true,
                        key: "delete",
                        onPress: () => setPendingDelete(topic),
                        symbol: "delete",
                        title: "삭제",
                      },
                    ]
                  : []
              }
              key={topic.id}
              leading={
                <Avatar
                  name={topic.authorNickname}
                  size={AVATAR_SIZE}
                  uri={topic.authorAvatarUrl}
                />
              }
              onPress={() => onOpenChat(topic)}
              supportingText={topicSubtitle(topic)}
              testID={`topic-row-${topic.id}`}
              title={topic.title}
            />
          ))}
          {loadMore ? (
            <LoadSentinel
              isLoading={loadMore.isLoading}
              onVisible={loadMore.onVisible}
              testID="topic-list-load-sentinel"
            />
          ) : null}
        </NativeList>
      </Host>
      {/* Own Host: a modal alert presentation is a separate SwiftUI/Compose
          subtree from the list above (DESIGN.md §4 interop). */}
      <Host matchContents seedColor={colors.primary}>
        <ConfirmAlert
          {...topicDeleteConfirmCopy()}
          destructive
          isPresented={pendingDelete !== null}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            if (target) onDeleteConfirmed(target);
          }}
          onDismiss={() => setPendingDelete(null)}
          testID="topic-list-delete-confirm"
        />
      </Host>
    </>
  );
}

export function topicSubtitle(topic: Topic): string {
  const base = `${topic.authorNickname} · ${topic.status === "seed" ? "새 주제" : "이야기 있음"}`;
  return topic.tags.length
    ? `${base} · ${topic.tags.map((tag) => `#${tag.tag}`).join(" ")}`
    : base;
}

const styles = StyleSheet.create({ host: { flex: 1 } });
