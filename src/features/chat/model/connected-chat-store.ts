import type { AccountPrincipal } from "@/core/database/account/types";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedChatMedia,
  ConnectedChatMessage,
  ConnectedChatRepository,
  ConnectedMessageAndCommand,
  ConnectedChatroom,
  ConnectedChatroomCursor,
  ConnectedChatroomUpsert,
  ConnectedHistoryMessageUpsert,
  ConnectedMessageCursor,
  ConnectedSendErrorCode,
} from "@/core/database/account/connected-chat-types";
import type {
  CanonicalChatMessage,
  Chatroom,
  ChatMessage as WireChatMessage,
  MessageAttachment,
} from "@/core/contracts/server";
import { ChatApiError } from "@/features/chat/data/chat-api";
import type { ChatApi } from "@/features/chat/data/chat-api";
import type { ClockPort } from "@/features/chat/model/chat-send";
import { createConnectedChatRead, emptyReadState } from "./connected-chat-read";
import type { ConnectedChatReadState } from "./connected-chat-read";

const ROOMS_PAGE_LIMIT = 30;
const HISTORY_WINDOW_LIMIT = 50;
const MAX_RENDERED_ROWS = 200;

export type { ClockPort };

/** Distinct from `MessageIdentityPort` (M5 local-only send): C4's outbox also needs a commandId. */
export type ConnectedMessageIdentityPort = Readonly<{
  next: () => Readonly<{
    clientMsgId: string;
    commandId: string;
    localId: string;
  }>;
}>;

/** Only adapters/composition supply this callback; views consume store actions. */
export type AuthorizedChatRequest = <T>(
  execute: (token: string, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>;

export type ConnectedChatRoomsState = Readonly<{
  status: "idle" | "loading" | "ready" | "error";
  items: readonly ConnectedChatroom[];
  hasMore: boolean;
  nextAfter: ConnectedChatroomCursor | null;
  loadingMore: boolean;
  error: ConnectedSendErrorCode | null;
}>;

export type ConnectedChatHistoryState = Readonly<{
  status: "idle" | "loading" | "ready" | "error";
  items: readonly ConnectedChatMessage[];
  hasMore: boolean;
  loadingMore: boolean;
  error: ConnectedSendErrorCode | null;
}>;

export type ConnectedChatSendState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "pending"; clientMsgId: string }>
  | Readonly<{ status: "sent"; clientMsgId: string }>
  | Readonly<{
      status: "failed" | "uncertain";
      clientMsgId: string;
      errorCode: ConnectedSendErrorCode;
    }>;

export type ConnectedChatState = Readonly<{
  groupId: string | null;
  accessLost: boolean;
  chatroomId: string | null;
  rooms: ConnectedChatRoomsState;
  history: ConnectedChatHistoryState;
  send: ConnectedChatSendState;
  read: ConnectedChatReadState;
}>;

export type ConnectedChatStoreActions = Readonly<{
  loadRooms: (groupId: string) => Promise<void>;
  loadMoreRooms: () => Promise<void>;
  closeRooms: () => void;
  openRoom: (chatroomId: string) => Promise<void>;
  loadOlderHistory: () => Promise<void>;
  sendMessage: (
    body: string,
    onCommitted?: (localId: string) => void,
  ) => Promise<void>;
  retryMessage: (clientMsgId: string) => Promise<void>;
  markVisibleMessages: (ids: readonly string[]) => Promise<void>;
  retryRead: () => Promise<void>;
  closeRoom: () => void;
  background: () => void;
  foreground: () => Promise<void>;
}>;

export type ConnectedChatStore = Readonly<{
  getState: () => ConnectedChatState;
  setPrincipal: (
    principal: AccountPrincipal | null,
    repository: ConnectedChatRepository | null,
    authorize: AuthorizedChatRequest | null,
  ) => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
  actions: ConnectedChatStoreActions;
}>;

function initialState(): ConnectedChatState {
  return {
    groupId: null,
    accessLost: false,
    chatroomId: null,
    rooms: {
      status: "idle",
      items: [],
      hasMore: false,
      nextAfter: null,
      loadingMore: false,
      error: null,
    },
    history: {
      status: "idle",
      items: [],
      hasMore: false,
      loadingMore: false,
      error: null,
    },
    send: { status: "idle" },
    read: emptyReadState(),
  };
}

function mapSendErrorCode(error: unknown): ConnectedSendErrorCode {
  if (!(error instanceof ChatApiError)) return "unknown";
  if (error.status === 0 || error.status === 408) return "network";
  if (error.status === 401) return "unauthorized";
  if (error.status === 403) return "forbidden";
  if (error.status === 409) return "conflict";
  if (error.status === 422) return "validation";
  if (error.status >= 500) return "server_unavailable";
  return "unknown";
}

/** Only a transport failure (no response received at all) is ambiguous about server effect. */
function isUncertainSendOutcome(errorCode: ConnectedSendErrorCode): boolean {
  return errorCode === "network";
}

function isMembershipLost(error: unknown): boolean {
  return (
    error instanceof ChatApiError &&
    error.status === 403 &&
    error.code === "membership_required"
  );
}

function toConnectedMedia(wire: MessageAttachment): ConnectedChatMedia {
  return {
    byteSize: wire.byteSize,
    duration: wire.duration,
    filename: wire.filename,
    height: wire.height,
    id: wire.id,
    mediaUploadId: wire.mediaUploadId,
    position: wire.position,
    type: wire.type,
    width: wire.width,
  };
}

function toChatroomUpsert(wire: Chatroom): ConnectedChatroomUpsert {
  return {
    chatroomId: wire.id,
    createdAtRaw: wire.createdAt,
    groupId: wire.groupId,
    kind: wire.type,
    topicId: wire.topicId,
  };
}

/** The server message id doubles as the local key for a never-before-seen row; an
 * existing match is looked up by the repository itself and keeps its own local id. */
function toHistoryUpsert(wire: WireChatMessage): ConnectedHistoryMessageUpsert {
  return {
    body: wire.body,
    chatroomId: wire.chatroomId,
    clientMsgId: wire.clientMessageId,
    createdAtRaw: wire.createdAt,
    kind: wire.type,
    localId: wire.id,
    media: wire.media.map(toConnectedMedia),
    senderAvatarUrl: wire.senderAvatarUrl,
    senderId: wire.senderId,
    senderNickname: wire.senderNickname,
    serverMessageId: wire.id,
  };
}

function toCanonicalUpsert(
  wire: CanonicalChatMessage,
  localId: string,
  clientMsgId: string,
): ConnectedCanonicalMessageUpsert {
  return {
    body: wire.body,
    chatroomId: wire.chatroomId,
    clientMsgId,
    createdAtRaw: wire.createdAt,
    kind: wire.type,
    localId,
    media: wire.media.map(toConnectedMedia),
    senderId: wire.senderId,
    serverMessageId: wire.id,
  };
}

/** Bounded view snapshots only; incoming values always come from a fresh SQLite read. */
function joinPages<T>(
  previous: readonly T[],
  incoming: readonly T[],
  keyOf: (row: T) => string,
  prepend: boolean,
): readonly T[] {
  const latest = new Map(
    [...previous, ...incoming].map((row) => [keyOf(row), row]),
  );
  const ordered = prepend
    ? [...incoming, ...previous]
    : [...previous, ...incoming];
  const keys = [...new Set(ordered.map(keyOf))];
  const bounded = prepend
    ? keys.slice(0, MAX_RENDERED_ROWS)
    : keys.slice(-MAX_RENDERED_ROWS);
  return bounded.map((key) => latest.get(key)!);
}

export function createConnectedChatStore(
  deps: Readonly<{
    clock: ClockPort;
    createApi: (origin: string) => ChatApi;
    messageIdentity: ConnectedMessageIdentityPort;
  }>,
): ConnectedChatStore {
  let identity = "";
  let api: ChatApi | null = null;
  let repository: ConnectedChatRepository | null = null;
  let authorize: AuthorizedChatRequest | null = null;
  let state = initialState();
  const listeners = new Set<() => void>();
  const requests = new Map<string, AbortController>();

  let roomsGroupId: string | null = null;
  let roomsHttpCursor: string | null = null;
  let historyHttpCursor: string | null = null;
  let historyRepoNextBefore: ConnectedMessageCursor | null = null;
  let historyBlocked = false;
  let active = true;
  let sendPreparation: Readonly<{
    identity: string;
    repo: ConnectedChatRepository;
    chatroomId: string;
    clientMsgId: string;
    write: Promise<ConnectedMessageAndCommand>;
  }> | null = null;
  let interruptedWrite: Promise<void> = Promise.resolve();
  const read = createConnectedChatRead({
    currentRoom: () => state.chatroomId,
    messages: () => state.history.items,
    enabled: () =>
      active && !historyBlocked && state.history.status !== "loading",
    begin: () => {
      const ticket = begin("read");
      return (
        ticket && {
          current: ticket.current,
          execute: (roomId: string, messageId: string) =>
            ticket.run((service, token, signal) =>
              service.markChatroomRead(token, roomId, { messageId }, signal),
            ),
        }
      );
    },
    publish: (next) => publish({ ...state, read: next }),
    errorCode: mapSendErrorCode,
    onError: (error) => {
      if (isMembershipLost(error))
        publish({
          ...state,
          history: historyErrorPatch(state.history, error),
          accessLost: true,
        });
    },
  });

  function publish(next: ConnectedChatState): void {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function cancel(key: string): void {
    requests.get(key)?.abort();
    requests.delete(key);
  }
  function cancelAll(): void {
    for (const key of [...requests.keys()]) cancel(key);
  }
  function interruptSend(persist = true): void {
    cancel("send");
    const attempt = sendPreparation;
    sendPreparation = null;
    if (!persist) return;
    if (!attempt) {
      if (state.send.status === "pending")
        publish({ ...state, send: { status: "idle" } });
      return;
    }
    interruptedWrite = interruptedWrite
      .then(async () => {
        await attempt.write;
        if (identity !== attempt.identity || repository !== attempt.repo)
          return;
        await attempt.repo.markSendFailed({
          clientMsgId: attempt.clientMsgId,
          errorCode: "network",
        });
      })
      .catch(() => {
        if (
          identity === attempt.identity &&
          repository === attempt.repo &&
          state.chatroomId === attempt.chatroomId
        ) {
          publish({
            ...state,
            send: {
              status: "failed",
              clientMsgId: attempt.clientMsgId,
              errorCode: "unknown",
            },
          });
        }
      });
    publish({
      ...state,
      send: {
        status: "uncertain",
        clientMsgId: attempt.clientMsgId,
        errorCode: "network",
      },
    });
  }
  function begin(key: string) {
    if (!active || !api || !authorize || !repository) return null;
    cancel(key);
    const controller = new AbortController();
    requests.set(key, controller);
    const executeAuthorized = authorize;
    const service = api;
    const repo = repository;
    const current = () =>
      requests.get(key) === controller && !controller.signal.aborted;
    return {
      repo,
      current,
      async run<T>(
        execute: (
          api: ChatApi,
          token: string,
          signal: AbortSignal,
        ) => Promise<T>,
      ): Promise<T> {
        if (!current()) throw new ChatApiError(0, "request_cancelled");
        return executeAuthorized((token, signal) => {
          if (!current() || signal.aborted)
            throw new ChatApiError(0, "request_cancelled");
          return execute(service, token, signal);
        }, controller.signal);
      },
    };
  }

  function setPrincipal(
    nextPrincipal: AccountPrincipal | null,
    nextRepository: ConnectedChatRepository | null,
    nextAuthorize: AuthorizedChatRequest | null,
  ): void {
    const origin = nextPrincipal?.origin ?? "";
    const valid =
      nextPrincipal &&
      nextRepository &&
      nextAuthorize &&
      nextPrincipal.userId.length > 0 &&
      Number.isSafeInteger(nextPrincipal.epoch);
    const key = valid
      ? JSON.stringify([origin, nextPrincipal.userId, nextPrincipal.epoch])
      : "";
    if (key === identity && repository === nextRepository) {
      authorize = valid ? nextAuthorize : null;
      return;
    }
    interruptSend(false);
    cancelAll();
    read.reset();
    identity = key;
    authorize = valid ? nextAuthorize : null;
    repository = valid ? nextRepository : null;
    api = valid ? deps.createApi(origin) : null;
    roomsGroupId = null;
    roomsHttpCursor = null;
    historyHttpCursor = null;
    historyRepoNextBefore = null;
    historyBlocked = false;
    interruptedWrite = Promise.resolve();
    publish(initialState());
  }

  function historyErrorPatch(
    previous: ConnectedChatHistoryState,
    error: unknown,
  ): ConnectedChatHistoryState {
    const errorCode = mapSendErrorCode(error);
    if (isMembershipLost(error)) {
      interruptSend();
      historyBlocked = true;
      cancel("read");
      historyHttpCursor = null;
      historyRepoNextBefore = null;
      return {
        status: "error",
        items: [],
        hasMore: false,
        loadingMore: false,
        error: errorCode,
      };
    }
    return {
      ...previous,
      status: "error",
      loadingMore: false,
      error: errorCode,
    };
  }

  /** Reads the current repository window; returns null if the ticket went stale mid-read. */
  async function readHistoryWindow(
    ticket: NonNullable<ReturnType<typeof begin>>,
    chatroomId: string,
    before: ConnectedMessageCursor | null,
  ): Promise<ConnectedChatHistoryState | null> {
    const window = await ticket.repo.listMessagesWindow({
      before,
      chatroomId,
      limit: HISTORY_WINDOW_LIMIT,
    });
    if (!ticket.current()) return null;
    historyRepoNextBefore = window.nextBefore;
    return {
      status: "ready",
      items: window.items,
      hasMore: window.hasMore || historyHttpCursor !== null,
      loadingMore: false,
      error: null,
    };
  }

  async function loadRooms(groupId: string, more: boolean): Promise<void> {
    const previous =
      roomsGroupId === groupId ? state.rooms : initialState().rooms;
    if (
      more &&
      ((previous.status !== "ready" && previous.status !== "error") ||
        previous.loadingMore ||
        !previous.hasMore)
    )
      return;
    const ticket = begin("rooms");
    if (!ticket) return;
    if (!more) {
      roomsGroupId = groupId;
      roomsHttpCursor = null;
    }
    publish({
      ...state,
      groupId,
      accessLost: false,
      rooms: {
        ...previous,
        status: more ? "ready" : "loading",
        loadingMore: more,
        error: null,
      },
    });
    try {
      if (!more || roomsHttpCursor !== null) {
        const page = await ticket.run((service, token, signal) =>
          service.listGroupChatrooms(
            token,
            groupId,
            more ? { after: roomsHttpCursor! } : {},
            signal,
          ),
        );
        if (!ticket.current()) return;
        if (page.items.length > 0)
          await ticket.repo.upsertChatrooms(page.items.map(toChatroomUpsert));
        if (!ticket.current()) return;
        roomsHttpCursor = page.nextCursor;
      }
      const result = await ticket.repo.listChatrooms({
        after: more ? previous.nextAfter : null,
        groupId,
        limit: ROOMS_PAGE_LIMIT,
      });
      if (!ticket.current()) return;
      publish({
        ...state,
        rooms: {
          status: "ready",
          items: more
            ? joinPages(
                previous.items,
                result.items,
                (row) => row.chatroomId,
                false,
              )
            : result.items,
          hasMore: result.hasMore || roomsHttpCursor !== null,
          nextAfter: result.nextAfter,
          loadingMore: false,
          error: null,
        },
      });
    } catch (error) {
      if (!ticket.current()) return;
      publish({
        ...state,
        accessLost: isMembershipLost(error),
        rooms: {
          ...previous,
          items: isMembershipLost(error) ? [] : previous.items,
          status: "error",
          loadingMore: false,
          error: mapSendErrorCode(error),
        },
      });
    }
  }

  async function openRoom(chatroomId: string): Promise<void> {
    const roomChanged = state.chatroomId !== chatroomId;
    if (roomChanged) interruptSend();
    const ticket = begin("history");
    if (!ticket) return;
    cancel("read");
    read.reset();
    historyBlocked = false;
    historyHttpCursor = null;
    historyRepoNextBefore = null;
    publish({
      ...state,
      chatroomId,
      accessLost: false,
      read: emptyReadState(),
      send: roomChanged ? { status: "idle" } : state.send,
      history: {
        status: "loading",
        items: [],
        hasMore: false,
        loadingMore: false,
        error: null,
      },
    });
    try {
      await interruptedWrite;
      if (!ticket.current()) return;
      const page = await ticket.run((service, token, signal) =>
        service.listChatroomMessages(token, chatroomId, {}, signal),
      );
      if (!ticket.current()) return;
      if (page.items.length > 0)
        await ticket.repo.mergeHistoryMessages(page.items.map(toHistoryUpsert));
      if (!ticket.current()) return;
      historyHttpCursor = page.nextCursor;
      const history = await readHistoryWindow(ticket, chatroomId, null);
      if (!history) return;
      publish({ ...state, history });
    } catch (error) {
      if (!ticket.current()) return;
      publish({
        ...state,
        history: historyErrorPatch(state.history, error),
        accessLost: historyBlocked,
      });
    }
  }

  async function loadOlderHistory(): Promise<void> {
    if (historyBlocked) return;
    const chatroomId = state.chatroomId;
    if (!chatroomId) return;
    const previous = state.history;
    if (
      (previous.status !== "ready" && previous.status !== "error") ||
      previous.loadingMore ||
      !previous.hasMore
    )
      return;
    const ticket = begin("history");
    if (!ticket) return;
    publish({
      ...state,
      history: { ...previous, loadingMore: true, error: null },
    });
    try {
      if (historyHttpCursor !== null) {
        const page = await ticket.run((service, token, signal) =>
          service.listChatroomMessages(
            token,
            chatroomId,
            { before: historyHttpCursor! },
            signal,
          ),
        );
        if (!ticket.current()) return;
        if (page.items.length > 0)
          await ticket.repo.mergeHistoryMessages(
            page.items.map(toHistoryUpsert),
          );
        if (!ticket.current()) return;
        historyHttpCursor = page.nextCursor;
      }
      const history = await readHistoryWindow(
        ticket,
        chatroomId,
        historyRepoNextBefore,
      );
      if (!history) return;
      publish({
        ...state,
        history: {
          ...history,
          items: joinPages(
            previous.items,
            history.items,
            (row) => row.localId,
            true,
          ),
        },
      });
    } catch (error) {
      if (!ticket.current()) return;
      publish({
        ...state,
        history: historyErrorPatch(state.history, error),
        accessLost: historyBlocked,
      });
    }
  }

  async function sendMessage(
    body: string,
    onCommitted?: (localId: string) => void,
  ): Promise<void> {
    if (historyBlocked || state.send.status === "pending" || !body.trim())
      return;
    const chatroomId = state.chatroomId;
    if (!chatroomId) return;
    const ticket = begin("send");
    if (!ticket) return;
    const identityInput = deps.messageIdentity.next();
    publish({
      ...state,
      send: { status: "pending", clientMsgId: identityInput.clientMsgId },
    });
    try {
      const write = ticket.repo.enqueuePendingMessage({
        body,
        chatroomId,
        clientMsgId: identityInput.clientMsgId,
        commandId: identityInput.commandId,
        localCreatedAtMs: deps.clock.nowMs(),
        localId: identityInput.localId,
      });
      sendPreparation = {
        identity,
        repo: ticket.repo,
        chatroomId,
        clientMsgId: identityInput.clientMsgId,
        write,
      };
      const enqueueResult = await write;
      if (!ticket.current()) return;
      onCommitted?.(enqueueResult.message.localId);
      await refreshAfterWrite(ticket, chatroomId);
      if (!ticket.current()) return;
      const result = await ticket.run((service, token, signal) =>
        service.sendChatMessage(
          token,
          enqueueResult.command.chatroomId,
          {
            body: enqueueResult.command.body,
            clientMessageId: enqueueResult.command.clientMsgId,
          },
          signal,
        ),
      );
      if (!ticket.current()) return;
      await ticket.repo.mergeCanonicalMessage(
        toCanonicalUpsert(
          result.message,
          enqueueResult.message.localId,
          identityInput.clientMsgId,
        ),
      );
      if (!ticket.current()) return;
      await publishSendSuccess(ticket, chatroomId, identityInput.clientMsgId);
    } catch (error) {
      await publishSendFailure(ticket, identityInput.clientMsgId, error);
    } finally {
      if (ticket.current()) sendPreparation = null;
    }
  }

  async function retryMessage(clientMsgId: string): Promise<void> {
    if (historyBlocked || state.send.status === "pending") return;
    const chatroomId = state.chatroomId;
    if (!chatroomId) return;
    const ticket = begin("send");
    if (!ticket) return;
    publish({ ...state, send: { status: "pending", clientMsgId } });
    try {
      const command = await ticket.repo.getOutboxCommand(clientMsgId);
      if (!ticket.current()) return;
      if (
        !command ||
        command.state !== "failed" ||
        command.chatroomId !== chatroomId
      ) {
        publish({ ...state, send: { status: "idle" } });
        return;
      }
      publish({
        ...state,
        send: { status: "pending", clientMsgId: command.clientMsgId },
      });
      const write = ticket.repo.retryFailedMessage({
        body: command.body,
        chatroomId: command.chatroomId,
        clientMsgId: command.clientMsgId,
      });
      sendPreparation = {
        identity,
        repo: ticket.repo,
        chatroomId,
        clientMsgId,
        write,
      };
      const retryResult = await write;
      if (!ticket.current()) return;
      await refreshAfterWrite(ticket, chatroomId);
      if (!ticket.current()) return;
      const result = await ticket.run((service, token, signal) =>
        service.sendChatMessage(
          token,
          command.chatroomId,
          { body: command.body, clientMessageId: command.clientMsgId },
          signal,
        ),
      );
      if (!ticket.current()) return;
      await ticket.repo.mergeCanonicalMessage(
        toCanonicalUpsert(
          result.message,
          retryResult.message.localId,
          command.clientMsgId,
        ),
      );
      if (!ticket.current()) return;
      await publishSendSuccess(ticket, command.chatroomId, command.clientMsgId);
    } catch (error) {
      await publishSendFailure(ticket, clientMsgId, error);
    } finally {
      if (ticket.current()) sendPreparation = null;
    }
  }

  /** Room changes cancel the send ticket before any late canonical merge or publication. */
  async function publishSendSuccess(
    ticket: NonNullable<ReturnType<typeof begin>>,
    chatroomId: string,
    clientMsgId: string,
  ): Promise<void> {
    if (!ticket.current() || state.chatroomId !== chatroomId) return;
    await refreshAfterWrite(ticket, chatroomId);
    if (ticket.current())
      publish({ ...state, send: { status: "sent", clientMsgId } });
  }

  async function refreshAfterWrite(
    ticket: NonNullable<ReturnType<typeof begin>>,
    chatroomId: string,
  ): Promise<void> {
    const window = await ticket.repo.listMessagesWindow({
      before: null,
      chatroomId,
      limit: HISTORY_WINDOW_LIMIT,
    });
    if (!ticket.current()) return;
    const keys = new Set(window.items.map((row) => row.localId));
    const previous = state.history;
    publish({
      ...state,
      history: {
        ...previous,
        items: [
          ...previous.items.filter((row) => !keys.has(row.localId)),
          ...window.items,
        ].slice(-MAX_RENDERED_ROWS),
      },
    });
  }

  async function publishSendFailure(
    ticket: NonNullable<ReturnType<typeof begin>>,
    clientMsgId: string,
    error: unknown,
  ): Promise<void> {
    if (!ticket.current()) return;
    const errorCode = mapSendErrorCode(error);
    try {
      await ticket.repo.markSendFailed({ clientMsgId, errorCode });
      if (ticket.current() && state.chatroomId)
        await refreshAfterWrite(ticket, state.chatroomId);
    } catch {
      if (ticket.current())
        publish({ ...state, history: { ...state.history, error: "unknown" } });
    }
    if (!ticket.current()) return;
    const history = isMembershipLost(error)
      ? historyErrorPatch(state.history, error)
      : state.history;
    publish({
      ...state,
      history,
      accessLost: historyBlocked,
      send: {
        status: isUncertainSendOutcome(errorCode) ? "uncertain" : "failed",
        clientMsgId,
        errorCode,
      },
    });
  }

  function closeRoom(): void {
    cancel("history");
    cancel("read");
    read.reset();
    interruptSend();
    historyHttpCursor = null;
    historyRepoNextBefore = null;
    historyBlocked = false;
    publish({
      ...state,
      chatroomId: null,
      accessLost: false,
      read: emptyReadState(),
      history: initialState().history,
      send: { status: "idle" },
    });
  }

  function background(): void {
    active = false;
    interruptSend();
    cancelAll();
    read.reset();
    publish({
      ...state,
      read: emptyReadState(),
      rooms: {
        ...state.rooms,
        status: state.rooms.status === "loading" ? "ready" : state.rooms.status,
        loadingMore: false,
      },
      history: {
        ...state.history,
        status:
          state.history.status === "loading" ? "ready" : state.history.status,
        loadingMore: false,
      },
    });
  }

  async function foreground(): Promise<void> {
    active = true;
    if (state.chatroomId) await openRoom(state.chatroomId);
    else if (roomsGroupId) await loadRooms(roomsGroupId, false);
  }

  return {
    getState: () => state,
    setPrincipal,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      setPrincipal(null, null, null);
      listeners.clear();
    },
    actions: {
      loadRooms: (groupId) => loadRooms(groupId, false),
      loadMoreRooms: () =>
        roomsGroupId ? loadRooms(roomsGroupId, true) : Promise.resolve(),
      closeRooms: () => {
        cancel("rooms");
        roomsGroupId = null;
        publish({
          ...state,
          groupId: null,
          rooms: initialState().rooms,
          accessLost: false,
        });
      },
      openRoom,
      loadOlderHistory,
      sendMessage,
      retryMessage,
      markVisibleMessages: read.markVisibleMessages,
      retryRead: read.retryRead,
      closeRoom,
      background,
      foreground,
    },
  };
}
