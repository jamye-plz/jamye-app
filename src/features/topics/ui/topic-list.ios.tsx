import { Host } from "@expo/ui";
import {
  Button,
  ContentUnavailableView,
  HStack,
  List,
  Section,
  Spacer,
  SwipeActions,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import {
  buttonStyle,
  disabled,
  font,
  listStyle,
  opacity,
  refreshable,
} from "@expo/ui/swift-ui/modifiers";
import { StyleSheet } from "react-native";

import type { Topic } from "@/core/contracts/server";

import type { TopicListProps } from "./topic-list.types";

export type * from "./topic-list.types";

/**
 * Topic list for iOS: a SwiftUI `List` so rows get the platform's own swipe
 * actions (ADR 0010). Tap opens the topic's chatroom; a trailing swipe reveals
 * 삭제 (destructive, at the edge, when a delete handler exists) and 상세. Full
 * swipe is off so a flick never fires the destructive action. Android resolves
 * to `topic-list.tsx`.
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
  return (
    <Host style={styles.host}>
      <List modifiers={[listStyle("insetGrouped"), refreshable(onRefresh)]}>
        <Section>
          {topics.map((topic) => (
            <SwipeActions key={topic.id}>
              <Button
                modifiers={[buttonStyle("plain")]}
                onPress={() => onOpenChat(topic)}
              >
                <HStack spacing={12}>
                  <VStack alignment="leading" spacing={2}>
                    <Text modifiers={[font({ textStyle: "headline" })]}>
                      {topic.title}
                    </Text>
                    <Text
                      modifiers={[
                        font({ textStyle: "subheadline" }),
                        opacity(0.65),
                      ]}
                    >
                      {topicSubtitle(topic)}
                    </Text>
                  </VStack>
                  <Spacer />
                  {topic.tags.length ? (
                    <Text
                      modifiers={[
                        font({ textStyle: "caption" }),
                        opacity(0.65),
                      ]}
                    >
                      {topic.tags.map((tag) => `#${tag.tag}`).join(" ")}
                    </Text>
                  ) : null}
                </HStack>
              </Button>
              <SwipeActions.Actions allowsFullSwipe={false} edge="trailing">
                {onDelete ? (
                  <Button
                    label="삭제"
                    onPress={() => onDelete(topic)}
                    role="destructive"
                    systemImage="trash"
                  />
                ) : null}
                <Button
                  label="상세"
                  onPress={() => onOpenDetail(topic)}
                  systemImage="info.circle"
                />
              </SwipeActions.Actions>
            </SwipeActions>
          ))}
          {empty ? (
            <ContentUnavailableView
              systemImage="text.bubble"
              title="선택한 날짜에 주제가 없습니다."
            />
          ) : null}
          {loadMore ? (
            <Button
              label={loadMore.busy ? "주제 더 보기 처리 중…" : "주제 더 보기"}
              modifiers={[disabled(loadMore.disabled || loadMore.busy)]}
              onPress={loadMore.onPress}
            />
          ) : null}
        </Section>
      </List>
    </Host>
  );
}

export function topicSubtitle(topic: Topic): string {
  return `${topic.authorNickname} · ${topic.status === "seed" ? "새 주제" : "이야기 있음"}`;
}

const styles = StyleSheet.create({ host: { flex: 1 } });
