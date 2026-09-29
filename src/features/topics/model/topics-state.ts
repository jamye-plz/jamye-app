import type { Topic, TopicDatePage, TopicTag } from "@/core/contracts/server";

export type TopicsError =
  | "network"
  | "unavailable"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "invalid_response"
  | "storage";
export type TopicsState = Readonly<{
  groupId: string | null;
  date: string;
  dates: TopicDatePage | null;
  datesBusy: boolean;
  items: readonly Topic[];
  nextCursor: string | null;
  status: "idle" | "loading" | "ready" | "error";
  loadingMore: boolean;
  error: TopicsError | null;
  accessLost: boolean;
  ownerId: string | null;
  editing: boolean;
  detail: Readonly<{
    id: string | null;
    topic: Topic | null;
    /**
     * M15/AC2/E5: "deleted" is a terminal state distinct from "error" -- a
     * `topic.deleted` event, or a topic-detail 404 (which reads as deleted
     * either way; the app cannot tell a hard-deleted topic apart from any
     * other 404 here), moves detail here instead of "error" so the screen
     * renders the exact-copy `삭제된 주제입니다.` state instead of a
     * retryable error.
     */
    status: "idle" | "loading" | "ready" | "error" | "deleted";
    tags: readonly TopicTag[];
    tagsComplete: boolean;
    error: TopicsError | null;
  }>;
  permissions: Readonly<{ canEdit: boolean; canManageTags: boolean }>;
  mutation: Readonly<{
    kind: "create" | "edit" | "tags" | "delete" | null;
    status: "idle" | "pending" | "succeeded" | "error" | "uncertain";
    error: TopicsError | null;
  }>;
}>;

export const emptyTopicDetail = (): TopicsState["detail"] => ({
  id: null,
  topic: null,
  status: "idle",
  tags: [],
  tagsComplete: false,
  error: null,
});
export const emptyTopicMutation = (): TopicsState["mutation"] => ({
  kind: null,
  status: "idle",
  error: null,
});
export const initialTopicsState = (): TopicsState => ({
  groupId: null,
  date: "",
  dates: null,
  datesBusy: false,
  items: [],
  nextCursor: null,
  status: "idle",
  loadingMore: false,
  error: null,
  accessLost: false,
  ownerId: null,
  editing: false,
  detail: emptyTopicDetail(),
  permissions: { canEdit: false, canManageTags: false },
  mutation: emptyTopicMutation(),
});
