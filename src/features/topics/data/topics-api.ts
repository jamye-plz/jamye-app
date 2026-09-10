import { parsePublicApiOrigin } from "@/core/config/public-env";
import {
  mapTopic,
  mapTopicDates,
  mapTopicPage,
  mapTopicTags,
  validateCanonicalTopic,
  validateErrorEnvelope,
  validateTagPage,
  validateTopicDatePage,
  validateTopicPage,
  type CanonicalTopicWire,
} from "@/core/contracts/server";
import {
  HttpAbortedError,
  REQUEST_TIMEOUT_MS,
  parseJsonResponseBody,
  withTimeoutSignal,
} from "@/core/http/http-client";
import {
  isTopicDate,
  isTopicIdentifier,
  isTopicPatch,
  isTopicTags,
  isTopicTitle,
  normalizeTopicPatch,
  normalizeTopicTags,
  type TopicCreateInput,
  type TopicListParams,
  type TopicPatchInput,
  type TopicsPageParams,
  type TopicTagInput,
} from "../model/topics-input";

export class TopicsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super("Topic request failed.");
  }
}
function identifier(value: string): string {
  if (!isTopicIdentifier(value))
    throw new TopicsApiError(422, "invalid_identifier");
  return encodeURIComponent(value);
}
function pageQuery(params: TopicListParams, maximum: number): string {
  if (
    params.limit !== undefined &&
    (!Number.isInteger(params.limit) ||
      params.limit < 1 ||
      params.limit > maximum)
  )
    throw new TopicsApiError(422, "invalid_page_limit");
  if (params.date !== undefined && !isTopicDate(params.date))
    throw new TopicsApiError(422, "invalid_topic_date");
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.after !== undefined) query.set("after", params.after);
  if (params.date !== undefined) query.set("date", params.date);
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}
function validTopic(
  value: unknown,
  groupId: string,
  topicId?: string,
): value is CanonicalTopicWire {
  return (
    validateCanonicalTopic(value) &&
    value.group_id === groupId &&
    (topicId === undefined || value.id === topicId) &&
    value.tags.every((tag) => tag.topic_id === value.id) &&
    value.media.every((media) => media.topic_id === value.id)
  );
}
function requireTopic(value: unknown, groupId: string, topicId?: string) {
  if (!validTopic(value, groupId, topicId))
    throw new TopicsApiError(502, "invalid_topic_response");
  return mapTopic(value);
}

export function createTopicsApi(origin: string) {
  const apiOrigin = parsePublicApiOrigin(origin);
  const groupPath = (groupId: string) =>
    `/api/v1/groups/${identifier(groupId)}/topics`;
  const detailPath = (groupId: string, topicId: string) =>
    `${groupPath(groupId)}/${identifier(topicId)}`;
  async function request(
    path: string,
    token: string,
    signal: AbortSignal | undefined,
    init: RequestInit = {},
    statuses = [200],
  ): Promise<unknown> {
    try {
      const { status, ok, payload } = await withTimeoutSignal(
        signal,
        REQUEST_TIMEOUT_MS,
        async (composedSignal) => {
          const response = await fetch(`${apiOrigin}${path}`, {
            ...init,
            credentials: "omit",
            redirect: "error",
            signal: composedSignal,
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
              ...(init.body ? { "Content-Type": "application/json" } : {}),
              ...init.headers,
            },
          });
          return {
            status: response.status,
            ok: response.ok,
            payload: await parseJsonResponseBody(response),
          };
        },
      );
      if (!ok)
        throw new TopicsApiError(
          status,
          validateErrorEnvelope(payload)
            ? payload.error.code
            : "request_failed",
        );
      if (!statuses.includes(status))
        throw new TopicsApiError(502, "invalid_response_status");
      return payload;
    } catch (error) {
      if (error instanceof TopicsApiError) throw error;
      if (error instanceof HttpAbortedError)
        throw new TopicsApiError(
          error.by === "caller" ? 0 : 408,
          error.by === "caller" ? "request_cancelled" : "request_timeout",
        );
      throw new TopicsApiError(0, "network_unavailable");
    }
  }
  return {
    async createTopic(
      token: string,
      groupId: string,
      input: TopicCreateInput,
      signal?: AbortSignal,
    ) {
      if (
        !isTopicTitle(input.title) ||
        !isTopicIdentifier(input.idempotencyKey)
      )
        throw new TopicsApiError(422, "invalid_topic_create");
      const value = await request(
        groupPath(groupId),
        token,
        signal,
        {
          method: "POST",
          headers: { "Idempotency-Key": input.idempotencyKey },
          body: JSON.stringify({ title: input.title.trim() }),
        },
        [200, 201],
      );
      return requireTopic(value, groupId);
    },
    async listDates(
      token: string,
      groupId: string,
      params: TopicsPageParams,
      signal?: AbortSignal,
    ) {
      const value = await request(
        `${groupPath(groupId)}/dates${pageQuery(params, 366)}`,
        token,
        signal,
      );
      if (!validateTopicDatePage(value))
        throw new TopicsApiError(502, "invalid_topic_dates_response");
      return mapTopicDates(value);
    },
    async listTopics(
      token: string,
      groupId: string,
      params: TopicListParams,
      signal?: AbortSignal,
    ) {
      const value = await request(
        `${groupPath(groupId)}${pageQuery(params, 100)}`,
        token,
        signal,
      );
      if (
        !validateTopicPage(value) ||
        !value.items.every((topic) => validTopic(topic, groupId))
      )
        throw new TopicsApiError(502, "invalid_topic_page_response");
      return mapTopicPage(value);
    },
    async getTopic(
      token: string,
      groupId: string,
      topicId: string,
      signal?: AbortSignal,
    ) {
      return requireTopic(
        await request(detailPath(groupId, topicId), token, signal),
        groupId,
        topicId,
      );
    },
    async updateTopic(
      token: string,
      groupId: string,
      topicId: string,
      input: TopicPatchInput,
      signal?: AbortSignal,
    ) {
      if (!isTopicPatch(input))
        throw new TopicsApiError(422, "invalid_topic_patch");
      return requireTopic(
        await request(detailPath(groupId, topicId), token, signal, {
          method: "PATCH",
          body: JSON.stringify(normalizeTopicPatch(input)),
        }),
        groupId,
        topicId,
      );
    },
    async replaceTags(
      token: string,
      groupId: string,
      topicId: string,
      tags: readonly TopicTagInput[],
      signal?: AbortSignal,
    ) {
      if (!isTopicTags(tags))
        throw new TopicsApiError(422, "invalid_topic_tags");
      const value = await request(
        `${detailPath(groupId, topicId)}/tags`,
        token,
        signal,
        {
          method: "PUT",
          body: JSON.stringify({ tags: normalizeTopicTags(tags) }),
        },
      );
      if (
        !validateTagPage(value) ||
        !value.items.every((tag) => tag.topic_id === topicId)
      )
        throw new TopicsApiError(502, "invalid_topic_tags_response");
      return mapTopicTags(value);
    },
    async listTags(
      token: string,
      groupId: string,
      topicId: string,
      params: TopicsPageParams,
      signal?: AbortSignal,
    ) {
      const value = await request(
        `${detailPath(groupId, topicId)}/tags${pageQuery(params, 100)}`,
        token,
        signal,
      );
      if (
        !validateTagPage(value) ||
        !value.items.every((tag) => tag.topic_id === topicId)
      )
        throw new TopicsApiError(502, "invalid_topic_tags_response");
      return mapTopicTags(value);
    },
  };
}
export type TopicsApi = ReturnType<typeof createTopicsApi>;
