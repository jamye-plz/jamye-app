import type {
  CanonicalTopicWire,
  TagPageWire,
  TopicDatePageWire,
  TopicPageWire,
  TopicTagWire,
} from "./validators";

export type TopicTag = Readonly<{
  id: string;
  topicId: string;
  tag: string;
  source: "user" | "ai";
  confidence: number | null;
}>;
export type TopicMedia = Readonly<{
  id: string;
  topicId: string;
  mediaUploadId: string;
  contentType: string;
  objectKey: string;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  createdAt: string;
}>;
export type Topic = Readonly<{
  id: string;
  groupId: string;
  authorId: string;
  authorNickname: string;
  authorAvatarUrl: string | null;
  title: string;
  body: string | null;
  status: "seed" | "enriched";
  tags: readonly TopicTag[];
  media: readonly TopicMedia[];
  chatroomId: string;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
}>;
export type TopicPage = Readonly<{
  items: readonly Topic[];
  nextCursor: string | null;
}>;
export type TopicDatePage = Readonly<{
  dates: readonly string[];
  today: string;
  nextCursor: string | null;
}>;
export type TopicTagPage = Readonly<{
  items: readonly TopicTag[];
  nextCursor: string | null;
}>;

export function mapTopicTag(wire: TopicTagWire): TopicTag {
  return {
    id: wire.id,
    topicId: wire.topic_id,
    tag: wire.tag,
    source: wire.source,
    confidence: wire.confidence,
  };
}
export function mapTopic(wire: CanonicalTopicWire): Topic {
  return {
    id: wire.id,
    groupId: wire.group_id,
    authorId: wire.author_id,
    authorNickname: wire.author_nickname,
    authorAvatarUrl: wire.author_avatar_url,
    title: wire.title,
    body: wire.body,
    status: wire.status,
    tags: wire.tags.map(mapTopicTag),
    media: wire.media.map((item) => ({
      id: item.id,
      topicId: item.topic_id,
      mediaUploadId: item.media_upload_id,
      contentType: item.content_type,
      objectKey: item.object_key,
      width: item.width,
      height: item.height,
      byteSize: item.byte_size,
      createdAt: item.created_at,
    })),
    chatroomId: wire.chatroom_id,
    unread: wire.unread,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  };
}
export function mapTopicPage(wire: TopicPageWire): TopicPage {
  return { items: wire.items.map(mapTopic), nextCursor: wire.next_cursor };
}
export function mapTopicDates(wire: TopicDatePageWire): TopicDatePage {
  return { dates: wire.dates, today: wire.today, nextCursor: wire.next_cursor };
}
export function mapTopicTags(wire: TagPageWire): TopicTagPage {
  return { items: wire.items.map(mapTopicTag), nextCursor: wire.next_cursor };
}

export function topicToWire(topic: Topic): CanonicalTopicWire {
  return {
    id: topic.id,
    group_id: topic.groupId,
    author_id: topic.authorId,
    author_nickname: topic.authorNickname,
    author_avatar_url: topic.authorAvatarUrl,
    title: topic.title,
    body: topic.body,
    status: topic.status,
    chatroom_id: topic.chatroomId,
    unread: topic.unread,
    created_at: topic.createdAt,
    updated_at: topic.updatedAt,
    tags: topic.tags.map((tag) => ({
      id: tag.id,
      topic_id: tag.topicId,
      tag: tag.tag,
      source: tag.source,
      confidence: tag.confidence,
    })),
    media: topic.media.map((item) => ({
      id: item.id,
      topic_id: item.topicId,
      media_upload_id: item.mediaUploadId,
      content_type: item.contentType,
      object_key: item.objectKey,
      width: item.width,
      height: item.height,
      byte_size: item.byteSize,
      created_at: item.createdAt,
    })),
  };
}
