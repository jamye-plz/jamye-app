import { Host, Icon, ListItem, Text } from "@expo/ui";
import { StyleSheet } from "react-native";

import type { Topic } from "@/core/contracts/server";
import { useAppTheme } from "@/core/theme/theme-provider";
import { Avatar } from "@/shared/ui/avatar";
import { LoadSentinel } from "@/shared/ui/load-sentinel";
import { NativeList } from "@/shared/ui/native-list";
import { StandardStateViewErrorRow } from "@/shared/ui/standard-state-view";

import type { TopicListProps } from "./topic-list.types";

export type * from "./topic-list.types";

const AVATAR_SIZE = 40;
const CHEVRON_OPACITY = { opacity: 0.3 } as const;

/**
 * Topic list (T2, T4): tap opens the topic's chatroom, nothing else -- no
 * swipe, context menu, or ⋮ (삭제 is M15). Leading is the author's avatar
 * (`author_avatar_url` / monogram, T3); iOS keeps the row-moves-forward
 * chevron for consistency with the group list. Only rendered once there is
 * at least one row: `topics-screen.tsx` shows `StandardStateView` for the
 * loading/empty/error-with-no-rows states instead.
 */
export function TopicList({
  loadMore,
  onOpenChat,
  onRefresh,
  testID,
  topError,
  topics,
}: TopicListProps) {
  const { colors } = useAppTheme();
  const isIos = process.env.EXPO_OS === "ios";
  return (
    <Host seedColor={colors.primary} style={styles.host}>
      <NativeList onRefresh={onRefresh} testID={testID ?? "topic-list"}>
        {isIos && topError ? (
          <StandardStateViewErrorRow
            message={topError.message}
            onRetry={topError.onRetry}
            testID="topic-list-top-error"
          />
        ) : null}
        {topics.map((topic) => (
          <ListItem
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
            trailing={
              isIos ? (
                <Icon name="chevron.right" size={14} style={CHEVRON_OPACITY} />
              ) : undefined
            }
          >
            <Text>{topic.title}</Text>
          </ListItem>
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
  );
}

export function topicSubtitle(topic: Topic): string {
  const base = `${topic.authorNickname} · ${topic.status === "seed" ? "새 주제" : "이야기 있음"}`;
  return topic.tags.length
    ? `${base} · ${topic.tags.map((tag) => `#${tag.tag}`).join(" ")}`
    : base;
}

const styles = StyleSheet.create({ host: { flex: 1 } });
