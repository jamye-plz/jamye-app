import { Button, Column, Host, Icon, Text } from "@expo/ui";
import { StyleSheet } from "react-native";

import type { Topic } from "@/core/contracts/server";
import { useAppTheme } from "@/core/theme/theme-provider";
import { ActionListItem } from "@/shared/ui/action-list-item";
import type { RowAction } from "@/shared/ui/action-list-item.types";
import { NativeList } from "@/shared/ui/native-list";

import type { TopicListProps } from "./topic-list.types";

export type * from "./topic-list.types";

const MUTED = { opacity: 0.65 } as const;
const EMPTY_ICON = {
  android: require("../../../../assets/icons/material/forum.xml"),
  ios: "text.bubble",
} as const;

/**
 * Topic list on the shared native list and row: tap opens the topic's
 * chatroom; 상세 (and 삭제 once a delete handler exists) surface as iOS swipe
 * / context-menu actions and as the Android long-press / ⋮ menu. The empty
 * and 더 보기 states are rows of the same list.
 */
export function TopicList({
  empty,
  loadMore,
  onDelete,
  onOpenChat,
  onOpenDetail,
  onRefresh,
  topics,
}: TopicListProps) {
  const { colors } = useAppTheme();
  return (
    <Host seedColor={colors.primary} style={styles.host}>
      <NativeList onRefresh={onRefresh} testID="topic-list">
        {topics.map((topic) => (
          <ActionListItem
            actions={topicRowActions(topic, onOpenDetail, onDelete)}
            key={topic.id}
            onPress={() => onOpenChat(topic)}
            supportingText={topicSubtitle(topic)}
            testID={`topic-row-${topic.id}`}
            title={topic.title}
          />
        ))}
        {empty ? (
          <Column
            alignment="center"
            spacing={8}
            style={{ paddingVertical: 32 }}
            testID="topic-list-empty"
          >
            <Icon name={EMPTY_ICON} size={44} style={MUTED} />
            <Text textStyle={{ fontSize: 17, fontWeight: "600" }}>
              선택한 날짜에 주제가 없습니다.
            </Text>
          </Column>
        ) : null}
        {loadMore ? (
          <Button
            disabled={loadMore.disabled || loadMore.busy}
            label={loadMore.busy ? "주제 더 보기 처리 중…" : "주제 더 보기"}
            onPress={loadMore.onPress}
            variant="text"
          />
        ) : null}
      </NativeList>
    </Host>
  );
}

export function topicRowActions(
  topic: Topic,
  onOpenDetail: (topic: Topic) => void,
  onDelete: ((topic: Topic) => void) | undefined,
): RowAction[] {
  const actions: RowAction[] = [
    {
      key: "detail",
      onPress: () => onOpenDetail(topic),
      symbol: "info",
      title: "상세",
    },
  ];
  if (onDelete)
    actions.push({
      destructive: true,
      key: "delete",
      onPress: () => onDelete(topic),
      symbol: "delete",
      title: "삭제",
    });
  return actions;
}

export function topicSubtitle(topic: Topic): string {
  const base = `${topic.authorNickname} · ${topic.status === "seed" ? "새 주제" : "이야기 있음"}`;
  return topic.tags.length
    ? `${base} · ${topic.tags.map((tag) => `#${tag.tag}`).join(" ")}`
    : base;
}

const styles = StyleSheet.create({ host: { flex: 1 } });
