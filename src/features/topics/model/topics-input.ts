import {
  validateTagReplace,
  validateTopicCreate,
  validateTopicPatch,
} from "@/core/contracts/server";
import { isServerDate } from "@/core/contracts/server/formats";

export type TopicCreateInput = Readonly<{
  title: string;
  idempotencyKey: string;
}>;
export type TopicPatchInput = Readonly<{
  title?: string | null;
  body?: string | null;
}>;
export type TopicTagInput = Readonly<{
  tag: string;
  source: "user" | "ai";
  confidence?: number | null;
}>;
export type TopicsPageParams = Readonly<{ after?: string; limit?: number }>;
export type TopicListParams = TopicsPageParams & Readonly<{ date?: string }>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isTopicIdentifier(value: string): boolean {
  return UUID.test(value);
}
export function isTopicDate(value: string): boolean {
  return isServerDate(value);
}
export function isTopicTitle(title: string): boolean {
  return validateTopicCreate({ title: title.trim() });
}
export function normalizeTopicPatch(input: TopicPatchInput): TopicPatchInput {
  return {
    ...input,
    ...(typeof input.title === "string" ? { title: input.title.trim() } : {}),
  };
}
export function isTopicPatch(input: TopicPatchInput): boolean {
  return (
    validateTopicPatch(normalizeTopicPatch(input)) &&
    (typeof input.body !== "string" || input.body.trim().length > 0)
  );
}
export function normalizeTopicTags(
  tags: readonly TopicTagInput[],
): readonly TopicTagInput[] {
  return tags.map(({ tag, source, confidence }) => ({
    tag: tag.trim(),
    source,
    ...(confidence !== undefined ? { confidence } : {}),
  }));
}
export function isTopicTags(tags: readonly TopicTagInput[]): boolean {
  const normalized = normalizeTopicTags(tags);
  return (
    validateTagReplace({ tags: normalized }) &&
    new Set(normalized.map((item) => item.tag)).size === normalized.length
  );
}
export function topicPermissions(
  topic: Readonly<{ authorId: string }>,
  userId: string,
  ownerId: string,
) {
  return {
    canEdit: topic.authorId === userId,
    canManageTags: topic.authorId === userId || ownerId === userId,
  };
}
