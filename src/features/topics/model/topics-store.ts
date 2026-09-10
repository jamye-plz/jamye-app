import { AuthApiError } from "@/core/auth/auth-api";
import type { Topic, TopicTag } from "@/core/contracts/server";
import type { TopicsRepository } from "@/core/database/account/topics-types";
import { TopicsApiError, type TopicsApi } from "../data/topics-api";
import {
  isTopicDate,
  isTopicIdentifier,
  isTopicPatch,
  isTopicTags,
  isTopicTitle,
  topicPermissions,
  type TopicPatchInput,
  type TopicTagInput,
} from "./topics-input";
import {
  emptyTopicDetail,
  emptyTopicMutation,
  initialTopicsState,
  type TopicsError,
  type TopicsState,
} from "./topics-state";

export type AuthorizedTopicsRequest = <T>(
  execute: (token: string, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>;
type Ticket = Readonly<{
  signal: AbortSignal;
  current: () => boolean;
  finish: () => void;
}>;
type Dependencies = Readonly<{
  api: TopicsApi;
  repository: TopicsRepository;
  userId: string;
  authorize: AuthorizedTopicsRequest;
  newKey: () => string;
  getOwner: (groupId: string, signal: AbortSignal) => Promise<string>;
  watchGroup: (groupId: string) => Promise<void>;
}>;

function outcome(error: unknown): TopicsError {
  if (error instanceof TopicsApiError || error instanceof AuthApiError) {
    if (error.status === 0 || error.status === 408) return "network";
    if (error.status === 401) return "unauthorized";
    if (error.status === 403) return "forbidden";
    if (error.status === 404) return "not_found";
    if (error.status === 409) return "conflict";
    if (error.status === 422) return "validation";
    if (error.status === 502) return "invalid_response";
    if (error.status >= 500) return "unavailable";
  }
  return "storage";
}
function unique<T>(
  items: readonly T[],
  key: (item: T) => string,
): readonly T[] {
  const result = new Map<string, T>();
  for (const item of items) result.set(key(item), item);
  return [...result.values()];
}
function assertCursor(
  next: string | null,
  after: string | null,
  seen: Set<string>,
) {
  if (next !== null && (next === after || seen.has(next)))
    throw new TopicsApiError(502, "cyclic_pagination");
}

/** One instance belongs to one principal/epoch. Providers remount on identity
 * changes; no token or offline mutation queue lives here. */
export function createTopicsStore(deps: Dependencies) {
  let state = initialTopicsState();
  let disposed = false;
  let active = true;
  let focused = false;
  let intent: { title: string; idempotencyKey: string } | null = null;
  const listeners = new Set<() => void>();
  const requests = new Map<string, AbortController>();
  const pageCursors = new Set<string>();
  const dateCursors = new Set<string>();
  let persistTail: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let refreshFlight: Promise<void> | null = null;
  let queuedRefresh = false;

  function publish(patch: Partial<TopicsState>) {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  function cancel(key: string) {
    requests.get(key)?.abort();
    requests.delete(key);
  }
  function cancelReads() {
    for (const key of ["list", "dates", "detail"]) cancel(key);
  }
  function cancelAll() {
    for (const key of [...requests.keys()]) cancel(key);
    if (timer) clearTimeout(timer);
    timer = null;
    queuedRefresh = false;
    refreshFlight = null;
  }
  function begin(key: string): Ticket | null {
    if (disposed || !active || !focused || !state.groupId || state.accessLost)
      return null;
    cancel(key);
    const controller = new AbortController();
    requests.set(key, controller);
    const group = state.groupId;
    return {
      signal: controller.signal,
      current: () =>
        !disposed &&
        active &&
        focused &&
        state.groupId === group &&
        !controller.signal.aborted &&
        requests.get(key) === controller,
      finish: () => {
        if (requests.get(key) === controller) {
          requests.delete(key);
          controller.abort();
        }
      },
    };
  }
  async function persist(ticket: Ticket, run: () => Promise<void>) {
    const task = persistTail.then(async () => {
      if (ticket.current()) await run();
    });
    persistTail = task.catch(() => {});
    await task;
  }
  function request<T>(
    ticket: Ticket,
    execute: (token: string, signal: AbortSignal) => Promise<T>,
  ) {
    return deps.authorize(execute, ticket.signal);
  }
  async function handleFailure(
    error: unknown,
    ticket: Ticket,
  ): Promise<boolean> {
    if (!ticket.current()) return true;
    const groupLost =
      error instanceof TopicsApiError &&
      (error.code === "membership_required" ||
        error.code === "group_not_found");
    if (groupLost || outcome(error) === "unauthorized") {
      const group = state.groupId!;
      await persist(ticket, () => deps.repository.invalidateGroup(group)).catch(
        () => {},
      );
      if (!ticket.current()) return true;
      cancelAll();
      intent = null;
      publish({
        ...initialTopicsState(),
        groupId: group,
        accessLost: true,
        status: "error",
        error: outcome(error),
      });
      return true;
    }
    return false;
  }
  function enter(groupId: string) {
    if (disposed || !isTopicIdentifier(groupId)) return false;
    focused = true;
    if (state.groupId !== groupId) {
      cancelAll();
      intent = null;
      pageCursors.clear();
      dateCursors.clear();
      publish({ ...initialTopicsState(), groupId });
    }
    return active && !state.accessLost;
  }
  async function refreshList() {
    if (state.mutation.status === "pending") {
      queuedRefresh = true;
      return;
    }
    const ticket = begin("list");
    if (!ticket) return;
    const group = state.groupId!;
    const date = state.date;
    cancel("dates");
    publish({
      status: "loading",
      error: null,
      loadingMore: false,
      datesBusy: false,
    });
    try {
      // Capture marker identity before I/O; a newer marker must survive this refresh.
      const markers = await deps.repository.listDirtyMarkers(group);
      if (!ticket.current()) return;
      if (!state.items.length) {
        const cached = await Promise.all([
          deps.repository.getDates(group),
          deps.repository.getPage(group, date),
        ]).catch(() => null);
        if (!ticket.current()) return;
        if (cached)
          publish({
            dates: cached[0],
            items: cached[1]?.items ?? [],
            nextCursor: cached[1]?.nextCursor ?? null,
          });
      }
      const [dates, page, owner] = await Promise.all([
        request(ticket, (token, signal) =>
          deps.api.listDates(token, group, { limit: 31 }, signal),
        ),
        request(ticket, (token, signal) =>
          deps.api.listTopics(
            token,
            group,
            { ...(date ? { date } : {}), limit: 20 },
            signal,
          ),
        ),
        deps.getOwner(group, ticket.signal),
      ]);
      if (!ticket.current()) return;
      await persist(ticket, () =>
        deps.repository.reconcileGroup(
          {
            groupId: group,
            date,
            dates,
            page,
            markers,
          },
          ticket.signal,
        ),
      );
      if (!ticket.current()) return;
      pageCursors.clear();
      dateCursors.clear();
      publish({
        dates,
        items: page.items,
        nextCursor: page.nextCursor,
        ownerId: owner,
        status: "ready",
        error: null,
        permissions: state.detail.topic
          ? topicPermissions(state.detail.topic, deps.userId, owner)
          : state.permissions,
      });
      // C1 owns chatroom subscriptions; this does not open another socket.
      await deps.watchGroup(group);
    } catch (error) {
      if (!(await handleFailure(error, ticket)) && ticket.current())
        publish({ status: "error", error: outcome(error) });
    } finally {
      ticket.finish();
    }
  }
  function scheduleRefresh() {
    if (
      disposed ||
      !active ||
      !focused ||
      !state.groupId ||
      state.accessLost ||
      timer
    )
      return;
    timer = setTimeout(() => {
      timer = null;
      void refresh();
    }, 250);
  }
  async function refresh(): Promise<void> {
    if (disposed || !active || !focused || state.accessLost) return;
    if (refreshFlight) {
      queuedRefresh = true;
      return refreshFlight;
    }
    const flight = refreshList();
    refreshFlight = flight;
    try {
      await flight;
    } finally {
      if (refreshFlight === flight) {
        refreshFlight = null;
        if (queuedRefresh && state.mutation.status !== "pending") {
          queuedRefresh = false;
          scheduleRefresh();
        }
      }
    }
  }
  async function allTags(
    ticket: Ticket,
    group: string,
    id: string,
  ): Promise<readonly TopicTag[]> {
    let after: string | undefined;
    const seen = new Set<string>();
    const items: TopicTag[] = [];
    for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
      const page = await request(ticket, (token, signal) =>
        deps.api.listTags(
          token,
          group,
          id,
          { ...(after ? { after } : {}), limit: 100 },
          signal,
        ),
      );
      if (!ticket.current()) return [];
      assertCursor(page.nextCursor, after ?? null, seen);
      items.push(...page.items);
      if (
        new Set(items.map((tag) => tag.id)).size !== items.length ||
        new Set(items.map((tag) => tag.tag)).size !== items.length
      )
        throw new TopicsApiError(502, "duplicate_tag_page");
      if (page.nextCursor === null) return items;
      if (!page.items.length) throw new TopicsApiError(502, "empty_tag_page");
      if (after) seen.add(after);
      after = page.nextCursor;
    }
    throw new TopicsApiError(502, "tag_page_limit");
  }
  async function loadDetail(id: string) {
    const ticket = begin("detail");
    if (!ticket || !isTopicIdentifier(id)) {
      ticket?.finish();
      return;
    }
    const group = state.groupId!;
    publish({
      detail: { ...emptyTopicDetail(), id, status: "loading" },
      permissions: { canEdit: false, canManageTags: false },
    });
    try {
      const [topic, tags, owner] = await Promise.all([
        request(ticket, (token, signal) =>
          deps.api.getTopic(token, group, id, signal),
        ),
        allTags(ticket, group, id),
        deps.getOwner(group, ticket.signal),
      ]);
      if (!ticket.current()) return;
      const complete = { ...topic, tags };
      await persist(ticket, () => deps.repository.saveTopic(complete));
      if (!ticket.current()) return;
      publish({
        ownerId: owner,
        detail: {
          id,
          topic: complete,
          tags,
          tagsComplete: true,
          status: "ready",
          error: null,
        },
        permissions: topicPermissions(complete, deps.userId, owner),
      });
    } catch (error) {
      if (!(await handleFailure(error, ticket)) && ticket.current())
        publish({
          detail: {
            ...emptyTopicDetail(),
            id,
            status: "error",
            error: outcome(error),
          },
        });
    } finally {
      ticket.finish();
    }
  }
  async function more(kind: "dates" | "list") {
    if (
      state.mutation.status === "pending" ||
      state.status !== "ready" ||
      state.loadingMore ||
      state.datesBusy
    )
      return;
    const after = kind === "list" ? state.nextCursor : state.dates?.nextCursor;
    if (!after) return;
    const ticket = begin(kind);
    if (!ticket) return;
    const group = state.groupId!;
    const date = state.date;
    publish(
      kind === "list"
        ? { loadingMore: true, error: null }
        : { datesBusy: true, error: null },
    );
    try {
      if (kind === "list") {
        const page = await request(ticket, (token, signal) =>
          deps.api.listTopics(
            token,
            group,
            { after, limit: 20, ...(date ? { date } : {}) },
            signal,
          ),
        );
        if (!ticket.current()) return;
        assertCursor(page.nextCursor, after, pageCursors);
        if (page.nextCursor && !page.items.length)
          throw new TopicsApiError(502, "empty_topic_page");
        const combined = {
          items: unique([...state.items, ...page.items], (item) => item.id),
          nextCursor: page.nextCursor,
        };
        await persist(ticket, () =>
          deps.repository.savePage(group, date, combined),
        );
        if (!ticket.current()) return;
        pageCursors.add(after);
        publish({
          items: combined.items,
          nextCursor: combined.nextCursor,
          loadingMore: false,
        });
      } else {
        const page = await request(ticket, (token, signal) =>
          deps.api.listDates(token, group, { after, limit: 31 }, signal),
        );
        if (!ticket.current()) return;
        assertCursor(page.nextCursor, after, dateCursors);
        if (page.nextCursor && !page.dates.length)
          throw new TopicsApiError(502, "empty_date_page");
        const dates = {
          ...page,
          dates: unique(
            [...(state.dates?.dates ?? []), ...page.dates],
            (item) => item,
          ),
        };
        await persist(ticket, () => deps.repository.saveDates(group, dates));
        if (!ticket.current()) return;
        dateCursors.add(after);
        publish({ dates, datesBusy: false });
      }
    } catch (error) {
      if (!(await handleFailure(error, ticket)) && ticket.current())
        publish({
          error: outcome(error),
          loadingMore: false,
          datesBusy: false,
        });
    } finally {
      ticket.finish();
    }
  }
  function startMutation(kind: "create" | "edit" | "tags") {
    if (state.mutation.status === "pending") return null;
    const ticket = begin("mutation");
    if (!ticket) return null;
    cancelReads();
    publish({
      mutation: { kind, status: "pending", error: null },
      loadingMore: false,
      datesBusy: false,
    });
    return ticket;
  }
  async function mutationFailure(
    error: unknown,
    ticket: Ticket,
    kind: "create" | "edit" | "tags",
  ) {
    if (await handleFailure(error, ticket)) return;
    if (!ticket.current()) return;
    const failure = outcome(error);
    const uncertain = ["network", "unavailable", "invalid_response"].includes(
      failure,
    );
    // Only a definitive rejection releases this attempt. In particular, keep
    // a conflicting key until an explicit reset instead of bypassing HTTP 409.
    if (
      kind === "create" &&
      ["validation", "forbidden", "not_found"].includes(failure)
    )
      intent = null;
    publish({
      mutation: {
        kind,
        status: uncertain ? "uncertain" : "error",
        error: failure,
      },
    });
    if (failure === "forbidden")
      publish({ permissions: { canEdit: false, canManageTags: false } });
    if (failure === "not_found")
      publish({
        detail: {
          ...emptyTopicDetail(),
          id: state.detail.id,
          status: "error",
          error: failure,
        },
        permissions: { canEdit: false, canManageTags: false },
      });
  }
  async function create(title: string): Promise<Topic | null> {
    if (
      disposed ||
      !active ||
      !focused ||
      state.accessLost ||
      state.mutation.status === "pending"
    )
      return null;
    if (!isTopicTitle(title)) {
      publish({
        mutation: { kind: "create", status: "error", error: "validation" },
      });
      return null;
    }
    const normalized = title.trim();
    if (intent && intent.title !== normalized) {
      publish({
        mutation: { kind: "create", status: "uncertain", error: "conflict" },
      });
      return null;
    }
    const ticket = startMutation("create");
    if (!ticket) return null;
    intent ??= { title: normalized, idempotencyKey: deps.newKey() };
    const group = state.groupId!;
    const submittedIntent = intent;
    try {
      const topic = await request(ticket, (token, signal) =>
        deps.api.createTopic(token, group, submittedIntent, signal),
      );
      if (!ticket.current()) return null;
      // The server confirmed creation: a cache failure must not claim it failed.
      await persist(ticket, () => deps.repository.saveTopic(topic)).catch(
        () => {
          if (ticket.current()) publish({ error: "storage" });
        },
      );
      if (!ticket.current()) return null;
      intent = null;
      publish({
        mutation: { kind: "create", status: "succeeded", error: null },
      });
      scheduleRefresh();
      return topic;
    } catch (error) {
      await mutationFailure(error, ticket, "create");
      return null;
    } finally {
      ticket.finish();
    }
  }
  async function edit(input: TopicPatchInput) {
    if (
      !state.permissions.canEdit ||
      !state.detail.topic ||
      !isTopicPatch(input)
    )
      return;
    const ticket = startMutation("edit");
    if (!ticket) return;
    const group = state.groupId!;
    const id = state.detail.topic!.id;
    try {
      const topic = await request(ticket, (token, signal) =>
        deps.api.updateTopic(token, group, id, input, signal),
      );
      if (!ticket.current()) return;
      await persist(ticket, () => deps.repository.saveTopic(topic)).catch(
        () => {
          if (ticket.current()) publish({ error: "storage" });
        },
      );
      if (!ticket.current()) return;
      publish({
        detail: { ...state.detail, topic },
        items: state.items.map((item) => (item.id === id ? topic : item)),
        mutation: { kind: "edit", status: "succeeded", error: null },
      });
      scheduleRefresh();
    } catch (error) {
      await mutationFailure(error, ticket, "edit");
    } finally {
      ticket.finish();
    }
  }
  async function saveTags(tags: readonly TopicTagInput[]) {
    if (
      !state.permissions.canManageTags ||
      !state.detail.topic ||
      !state.detail.tagsComplete ||
      !isTopicTags(tags)
    )
      return;
    const ticket = startMutation("tags");
    if (!ticket) return;
    const group = state.groupId!;
    const id = state.detail.topic!.id;
    try {
      await request(ticket, (token, signal) =>
        deps.api.replaceTags(token, group, id, tags, signal),
      );
      if (!ticket.current()) return;
      publish({ mutation: { kind: "tags", status: "succeeded", error: null } });
      // Replacement responses may themselves be paginated; read the entire set again.
      await loadDetail(id);
      if (ticket.current()) scheduleRefresh();
    } catch (error) {
      await mutationFailure(error, ticket, "tags");
    } finally {
      ticket.finish();
    }
  }
  function interrupt() {
    cancelAll();
    if (state.mutation.status === "pending")
      publish({
        mutation: { ...state.mutation, status: "uncertain", error: "network" },
      });
  }
  return {
    getState: () => state,
    getCreateTitle: () => intent?.title ?? "",
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      interrupt();
      disposed = true;
      focused = false;
      state = initialTopicsState();
      listeners.clear();
    },
    actions: {
      async openGroup(groupId: string) {
        if (!enter(groupId)) return;
        interrupt();
        publish({
          detail: emptyTopicDetail(),
          editing: false,
          permissions: { canEdit: false, canManageTags: false },
          ...(state.mutation.kind !== "create"
            ? { mutation: emptyTopicMutation() }
            : {}),
        });
        await refresh();
      },
      async openTopic(groupId: string, id: string) {
        if (!enter(groupId)) return;
        cancel("mutation");
        publish({ editing: false, mutation: emptyTopicMutation() });
        await loadDetail(id);
        if (
          !disposed &&
          focused &&
          !state.accessLost &&
          state.groupId === groupId &&
          state.detail.id === id
        )
          await deps.watchGroup(groupId);
      },
      refresh,
      async refreshDetail() {
        if (
          state.detail.id &&
          !state.editing &&
          state.mutation.status !== "pending"
        )
          await loadDetail(state.detail.id);
      },
      async selectDate(date: string) {
        if (date !== "" && !isTopicDate(date)) return;
        if (state.mutation.status === "pending") return;
        cancelReads();
        refreshFlight = null;
        publish({ date, items: [], nextCursor: null });
        await refresh();
      },
      moreTopics: () => more("list"),
      moreDates: () => more("dates"),
      create,
      edit,
      saveTags,
      resetCreate() {
        if (state.mutation.status === "pending") return;
        intent = null;
        publish({ mutation: emptyTopicMutation() });
      },
      clearMutation() {
        if (state.mutation.status !== "pending" && !intent)
          publish({ mutation: emptyTopicMutation() });
      },
      setEditing(editing: boolean) {
        if (state.editing !== editing) publish({ editing });
      },
      signal() {
        if (refreshFlight) queuedRefresh = true;
        else scheduleRefresh();
      },
      blur() {
        focused = false;
        interrupt();
      },
      background() {
        active = false;
        interrupt();
      },
      async foreground() {
        active = true;
        if (!focused) return;
        await refresh();
        if (state.detail.id && !state.editing)
          await loadDetail(state.detail.id);
      },
      revoke() {
        interrupt();
        intent = null;
        publish({
          ...initialTopicsState(),
          groupId: state.groupId,
          accessLost: true,
          error: "forbidden",
          status: "error",
        });
      },
    },
  };
}
export type TopicsStore = ReturnType<typeof createTopicsStore>;
