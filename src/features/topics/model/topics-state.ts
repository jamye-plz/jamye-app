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
    status: "idle" | "loading" | "ready" | "error";
    tags: readonly TopicTag[];
    tagsComplete: boolean;
    error: TopicsError | null;
  }>;
  permissions: Readonly<{ canEdit: boolean; canManageTags: boolean }>;
  mutation: Readonly<{
    kind: "create" | "edit" | "tags" | null;
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
