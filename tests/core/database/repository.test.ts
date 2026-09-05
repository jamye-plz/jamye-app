import type { FixtureConversationSeed } from "../../../src/core/database/repositories/database-repository";

type SqliteValue = string | number | null;

type SqliteRunResult = Readonly<{
  changes: number;
  lastInsertRowId: number;
}>;

type SqliteDatabase = {
  getAllAsync: <Row extends Record<string, SqliteValue>>(
    statement: string,
    ...values: SqliteValue[]
  ) => Promise<Row[]>;
  getFirstAsync: <Row extends Record<string, SqliteValue>>(
    statement: string,
    ...values: SqliteValue[]
  ) => Promise<Row | null>;
  runAsync: (
    statement: string,
    ...values: SqliteValue[]
  ) => Promise<SqliteRunResult>;
  withExclusiveTransactionAsync: <Result>(
    operation: (transaction: SqliteDatabase) => Promise<Result>,
  ) => Promise<Result>;
};

type Conversation = Readonly<{
  id: string;
  kind: "fixture";
  title: string;
  updatedAtMs: number;
}>;

type Message = Readonly<{
  body: string;
  clientMsgId: string | null;
  conversationId: string;
  createdAtMs: number;
  eventId: string | null;
  localId: string;
  senderId: string;
  serverSequence: number | null;
  status: "pending" | "sent" | "failed";
}>;

type SyncCursor = Readonly<{
  conversationId: string;
  cursor: string;
  serverSequence: number;
  updatedAtMs: number;
}>;

type DatabaseChange = Readonly<{
  conversationId: string;
  kind:
    | "message-and-outbox-committed"
    | "canonical-event-applied"
    | "message-retry-committed";
}>;

type PendingMessageInput = Readonly<{
  body: string;
  clientMsgId: string;
  conversationId: string;
  createdAtMs: number;
  localId: string;
  senderId: string;
}>;

type CanonicalMessageUpsert = Readonly<{
  cursor: string;
  eventId: string;
  message: Readonly<{
    body: string;
    clientMsgId: string | null;
    createdAtMs: number;
    localId: string;
    senderId: string;
  }>;
  conversationId: string;
  recordedAtMs: number;
  serverSequence: number;
}>;

type ApplyCanonicalResult = Readonly<{
  outcome: "applied" | "duplicate";
}>;

type UnknownEventInput = Readonly<{
  conversationId: string;
  eventId: string;
  payloadJson: string;
  recordedAtMs: number;
  serverSequence: number;
  type: string;
}>;

type RecordUnknownEventResult = Readonly<{
  outcome: "recorded" | "duplicate";
}>;

type MessageCursor = Readonly<{
  createdAtMs: number;
  localId: string;
}>;

type MessagePage = Readonly<{
  hasMore: boolean;
  items: readonly Message[];
  nextBefore: MessageCursor | null;
}>;

type RetryFailedMessageInput = Readonly<{
  clientMsgId: string;
  conversationId: string;
}>;

type DatabaseRepository = {
  applyCanonicalMessageUpsert: (
    event: CanonicalMessageUpsert,
  ) => Promise<ApplyCanonicalResult>;
  enqueuePendingMessage: (input: PendingMessageInput) => Promise<Message>;
  getCursor: (conversationId: string) => Promise<SyncCursor | null>;
  listMessagesPage: (input: {
    before: MessageCursor | null;
    conversationId: string;
    limit: number;
  }) => Promise<MessagePage>;
  recordUnknownEvent: (
    event: UnknownEventInput,
  ) => Promise<RecordUnknownEventResult>;
  subscribe: (listener: (change: DatabaseChange) => void) => () => void;
  ensureFixtureConversation: (
    fixture: FixtureConversationSeed,
  ) => Promise<void>;
  retryFailedMessage: (input: RetryFailedMessageInput) => Promise<Message>;
  upsertConversation: (conversation: Conversation) => Promise<void>;
};

type RepositoryModule = {
  createDatabaseRepository?: unknown;
};

type CreateDatabaseRepository = (
  database: SqliteDatabase,
) => DatabaseRepository;

type RunCall = Readonly<{
  statement: string;
  values: readonly SqliteValue[];
}>;

type DirectoryEntry = Readonly<{
  isDirectory: () => boolean;
  name: string;
}>;

type FileSystemModule = Readonly<{
  existsSync: (path: string) => boolean;
  readdirSync: (
    path: string,
    options: Readonly<{ withFileTypes: true }>,
  ) => DirectoryEntry[];
  readFileSync: (path: string, encoding: "utf8") => string;
}>;

type PathModule = Readonly<{
  extname: (path: string) => string;
  join: (...paths: string[]) => string;
  resolve: (...paths: string[]) => string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error.code === "MODULE_NOT_FOUND" ||
      (typeof error.message === "string" &&
        error.message.includes("Cannot find module")))
  );
}

function loadCreateDatabaseRepository(): CreateDatabaseRepository {
  let loaded: RepositoryModule;
  try {
    loaded = jest.requireActual<RepositoryModule>(
      "../../../src/core/database/repositories/database-repository",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M4-DB-1 implementation missing: database-repository.ts must export createDatabaseRepository(database).",
      );
    }
    throw error;
  }

  if (typeof loaded.createDatabaseRepository !== "function") {
    throw new Error(
      "M4-DB-1 implementation incomplete: repository module must expose createDatabaseRepository(database).",
    );
  }

  return loaded.createDatabaseRepository as CreateDatabaseRepository;
}

class TransactionRecordingDatabase implements SqliteDatabase {
  readonly committedRuns: RunCall[] = [];
  readonly readCalls: RunCall[] = [];
  readonly transactions: ("commit" | "rollback")[] = [];
  private committedEventIds = new Set<string>();
  private committedEventSequenceKeys = new Set<string>();
  private committedCursor?: SyncCursor;
  private failAtRun?: number;
  private pendingCursor?: SyncCursor;
  private pendingEventIds?: Set<string>;
  private pendingEventSequenceKeys?: Set<string>;
  private pendingRuns?: RunCall[];
  private queuedFirstRows: Record<string, SqliteValue>[] = [];
  private queuedReadRows: Record<string, SqliteValue>[][] = [];
  private runCount = 0;
  private transactionActive = false;

  get executedRunCount(): number {
    return this.runCount;
  }

  get isTransactionActive(): boolean {
    return this.transactionActive;
  }

  failOnRun(runNumber: number): void {
    this.failAtRun = runNumber;
  }

  queueReadRows(rows: readonly Record<string, SqliteValue>[]): void {
    this.queuedReadRows.push([...rows]);
  }

  queueFirstRow(row: Record<string, SqliteValue>): void {
    this.queuedFirstRows.push(row);
  }

  async getAllAsync<Row extends Record<string, SqliteValue>>(
    statement: string,
    ...values: SqliteValue[]
  ): Promise<Row[]> {
    this.readCalls.push({ statement, values });
    return (this.queuedReadRows.shift() ?? []) as unknown as Row[];
  }

  async getFirstAsync<Row extends Record<string, SqliteValue>>(
    statement: string,
    ...values: SqliteValue[]
  ): Promise<Row | null> {
    const queuedFirstRow = this.queuedFirstRows.shift();
    if (queuedFirstRow) return queuedFirstRow as unknown as Row;

    if (/FROM\s+sync_cursors/i.test(statement)) {
      const requestedConversationId = values.find(
        (value): value is string => typeof value === "string",
      );
      if (
        !requestedConversationId ||
        this.committedCursor?.conversationId !== requestedConversationId
      ) {
        return null;
      }

      return {
        conversation_id: this.committedCursor.conversationId,
        cursor: this.committedCursor.cursor,
        server_sequence: this.committedCursor.serverSequence,
        updated_at_ms: this.committedCursor.updatedAtMs,
      } as unknown as Row;
    }

    return null;
  }

  async runAsync(
    statement: string,
    ...values: SqliteValue[]
  ): Promise<SqliteRunResult> {
    this.runCount += 1;
    if (this.failAtRun === this.runCount) {
      throw new Error("synthetic repository write failure");
    }

    if (/INSERT\s+INTO\s+applied_events/i.test(statement)) {
      const eventId = values.find(
        (value): value is string =>
          typeof value === "string" && value.startsWith("event-"),
      );
      if (!eventId) {
        throw new Error(
          "Applied-event statement omitted the event identifier.",
        );
      }

      const eventIds = this.pendingEventIds ?? this.committedEventIds;
      if (eventIds.has(eventId)) {
        return { changes: 0, lastInsertRowId: this.runCount };
      }

      const conversationId = values[1];
      const serverSequence = values[3];
      if (
        typeof conversationId !== "string" ||
        typeof serverSequence !== "number"
      ) {
        throw new Error(
          "Applied-event statement omitted its conversation and server-sequence values.",
        );
      }

      const sequenceKeys =
        this.pendingEventSequenceKeys ?? this.committedEventSequenceKeys;
      const sequenceKey = `${conversationId}:${serverSequence}`;
      if (sequenceKeys.has(sequenceKey)) {
        throw new Error("synthetic applied-event sequence constraint failure");
      }

      eventIds.add(eventId);
      sequenceKeys.add(sequenceKey);
    }

    const call = { statement, values };
    const target = this.pendingRuns ?? this.committedRuns;
    target.push(call);

    if (/INSERT\s+INTO\s+sync_cursors/i.test(statement)) {
      const cursor = values.find(
        (value): value is string =>
          typeof value === "string" && /^cursor-\d+$/.test(value),
      );
      const conversationId = values.find(
        (value): value is string => value === "fixture-conversation",
      );
      if (!cursor || !conversationId) {
        throw new Error("Cursor statement omitted the approved cursor values.");
      }

      const incomingSequence = Number(cursor.replace("cursor-", ""));
      const previousCursor = this.pendingCursor ?? this.committedCursor;
      if (!previousCursor || incomingSequence > previousCursor.serverSequence) {
        const updatedAtMs = values.find(
          (value): value is number => value === 300,
        );
        if (updatedAtMs === undefined) {
          throw new Error("Cursor statement omitted the recorded-at value.");
        }
        this.pendingCursor = {
          conversationId,
          cursor,
          serverSequence: incomingSequence,
          updatedAtMs,
        };
      }
    }

    return { changes: 1, lastInsertRowId: this.runCount };
  }

  async withExclusiveTransactionAsync<Result>(
    operation: (transaction: SqliteDatabase) => Promise<Result>,
  ): Promise<Result> {
    this.transactionActive = true;
    this.pendingRuns = [];
    this.pendingEventIds = new Set(this.committedEventIds);
    this.pendingEventSequenceKeys = new Set(this.committedEventSequenceKeys);
    this.pendingCursor = this.committedCursor;

    try {
      const result = await operation(this);
      const pendingRuns = this.pendingRuns;
      const pendingEventIds = this.pendingEventIds;
      const pendingEventSequenceKeys = this.pendingEventSequenceKeys;
      if (!pendingRuns || !pendingEventIds || !pendingEventSequenceKeys) {
        throw new Error("Repository transaction did not retain pending state.");
      }
      this.committedRuns.push(...pendingRuns);
      this.committedEventIds = pendingEventIds;
      this.committedEventSequenceKeys = pendingEventSequenceKeys;
      this.committedCursor = this.pendingCursor;
      this.transactions.push("commit");
      return result;
    } catch (error) {
      this.transactions.push("rollback");
      throw error;
    } finally {
      this.pendingRuns = undefined;
      this.pendingEventIds = undefined;
      this.pendingEventSequenceKeys = undefined;
      this.pendingCursor = undefined;
      this.transactionActive = false;
    }
  }
}

function createConversation(): Conversation {
  return {
    id: "fixture-conversation",
    kind: "fixture",
    title: "Local fixture",
    updatedAtMs: 100,
  };
}

function createPendingMessage(): PendingMessageInput {
  return {
    body: "literal '); DROP TABLE messages; -- body",
    clientMsgId: "client-message-1",
    conversationId: "fixture-conversation",
    createdAtMs: 200,
    localId: "local-message-1",
    senderId: "fixture-sender",
  };
}

function createFixtureSeed(): FixtureConversationSeed {
  return {
    conversation: createConversation(),
    messages: [
      {
        body: "fixture sent message",
        clientMsgId: null,
        conversationId: "fixture-conversation",
        createdAtMs: 100,
        eventId: "fixture-event-1",
        localId: "fixture-message-sent",
        senderId: "fixture-sender",
        serverSequence: 1,
        status: "sent",
      },
      {
        body: "fixture failed message",
        clientMsgId: "fixture-client-failed-1",
        conversationId: "fixture-conversation",
        createdAtMs: 110,
        eventId: null,
        localId: "fixture-message-failed",
        senderId: "fixture-sender",
        serverSequence: null,
        status: "failed",
      },
    ],
    outboxCommands: [
      {
        body: "fixture failed message",
        clientMsgId: "fixture-client-failed-1",
        commandId: "outbox:fixture-client-failed-1",
        commandType: "message.create",
        conversationId: "fixture-conversation",
        createdAtMs: 110,
        state: "failed",
      },
    ],
  };
}

function messageRow(message: Message): Record<string, SqliteValue> {
  return {
    body: message.body,
    client_msg_id: message.clientMsgId,
    conversation_id: message.conversationId,
    created_at_ms: message.createdAtMs,
    event_id: message.eventId,
    local_id: message.localId,
    sender_id: message.senderId,
    server_sequence: message.serverSequence,
    status: message.status,
  };
}

function conversationRow(
  conversation: FixtureConversationSeed["conversation"],
): Record<string, SqliteValue> {
  return {
    id: conversation.id,
    kind: conversation.kind,
    title: conversation.title,
    updated_at_ms: conversation.updatedAtMs,
  };
}

function outboxRow(
  command: FixtureConversationSeed["outboxCommands"][number],
): Record<string, SqliteValue> {
  return {
    body: command.body,
    client_msg_id: command.clientMsgId,
    command_id: command.commandId,
    command_type: command.commandType,
    conversation_id: command.conversationId,
    created_at_ms: command.createdAtMs,
    state: command.state,
  };
}

function queuePersistedFixture(
  database: TransactionRecordingDatabase,
  fixture: FixtureConversationSeed,
  additionalMessages: readonly Message[] = [],
  additionalOutboxCommands: readonly Record<string, SqliteValue>[] = [],
): void {
  database.queueReadRows([conversationRow(fixture.conversation)]);
  database.queueReadRows([
    ...fixture.messages.map(messageRow),
    ...additionalMessages.map(messageRow),
  ]);
  database.queueReadRows([
    ...fixture.outboxCommands.map(outboxRow),
    ...additionalOutboxCommands,
  ]);
}

type PersistedFixtureRetrySnapshot = Readonly<{
  clientMsgId: string;
  messageBody?: string;
  messageStatus: Message["status"];
  outboxBody?: string;
  outboxState: "acked" | "failed" | "in_flight" | "queued";
}>;

function queuePersistedFixtureRetrySnapshot(
  database: TransactionRecordingDatabase,
  fixture: FixtureConversationSeed,
  snapshot: PersistedFixtureRetrySnapshot,
): void {
  let matchedMessage = false;
  let matchedOutboxCommand = false;

  const persistedMessages = fixture.messages.map((message) => {
    if (message.clientMsgId !== snapshot.clientMsgId) {
      return messageRow(message);
    }

    matchedMessage = true;
    return messageRow({
      ...message,
      body: snapshot.messageBody ?? message.body,
      status: snapshot.messageStatus,
    });
  });
  const persistedOutboxCommands = fixture.outboxCommands.map((command) => {
    if (command.clientMsgId !== snapshot.clientMsgId) {
      return outboxRow(command);
    }

    matchedOutboxCommand = true;
    return {
      ...outboxRow(command),
      body: snapshot.outboxBody ?? command.body,
      state: snapshot.outboxState,
    };
  });

  if (!matchedMessage || !matchedOutboxCommand) {
    throw new Error("Fixture retry snapshot requires a matching message pair.");
  }

  database.queueReadRows([conversationRow(fixture.conversation)]);
  database.queueReadRows(persistedMessages);
  database.queueReadRows(persistedOutboxCommands);
}

function createCanonicalEvent(serverSequence: number): CanonicalMessageUpsert {
  return {
    cursor: `cursor-${serverSequence}`,
    eventId: `event-${serverSequence}`,
    message: {
      body: "canonical message",
      clientMsgId: "client-message-1",
      createdAtMs: 200,
      localId: "local-message-1",
      senderId: "fixture-sender",
    },
    conversationId: "fixture-conversation",
    recordedAtMs: 300,
    serverSequence,
  };
}

function createUnknownEvent(
  eventId: string = "event-unknown-1",
  serverSequence: number = 6,
): UnknownEventInput {
  return {
    conversationId: "fixture-conversation",
    eventId,
    payloadJson: '{"kind":"future.event","value":"unknown"}',
    recordedAtMs: 400,
    serverSequence,
    type: "future.event",
  };
}

function assertRuntimeValuesAreBound(
  calls: readonly RunCall[],
  runtimeValues: readonly SqliteValue[],
): void {
  const statements = calls.map((call) => call.statement).join("\n");

  runtimeValues.forEach((value) => {
    expect(statements).not.toContain(String(value));
    expect(calls.some((call) => call.values.includes(value))).toBe(true);
  });
}

function loadNodeModules(): { fileSystem: FileSystemModule; path: PathModule } {
  return {
    fileSystem: jest.requireActual<FileSystemModule>("node:fs"),
    path: jest.requireActual<PathModule>("node:path"),
  };
}

function listSourceFiles(
  root: string,
  fileSystem: FileSystemModule,
  path: PathModule,
): string[] {
  if (!fileSystem.existsSync(root)) return [];

  return fileSystem
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory())
        return listSourceFiles(fullPath, fileSystem, path);
      return [fullPath];
    });
}

describe("M4-DB-1 injectable SQLite repository contract", () => {
  test("exposes typed camelCase entities and atomically persists a pending message with its outbox command", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const changes: DatabaseChange[] = [];
    const notificationTransactionActivity: boolean[] = [];
    const pending = createPendingMessage();

    await repository.upsertConversation(createConversation());
    const committedBeforePendingMessage = database.committedRuns.length;
    const transactionsBeforePendingMessage = database.transactions.length;
    const unsubscribe = repository.subscribe((change) => {
      changes.push(change);
      notificationTransactionActivity.push(database.isTransactionActive);
    });
    const message = await repository.enqueuePendingMessage(pending);

    unsubscribe();

    expect(message).toEqual({
      body: pending.body,
      clientMsgId: pending.clientMsgId,
      conversationId: pending.conversationId,
      createdAtMs: pending.createdAtMs,
      eventId: null,
      localId: pending.localId,
      senderId: pending.senderId,
      serverSequence: null,
      status: "pending",
    });
    expect(
      database.transactions.slice(transactionsBeforePendingMessage),
    ).toEqual(["commit"]);
    const pendingMessageWrites = database.committedRuns.slice(
      committedBeforePendingMessage,
    );
    const conversationWrites = database.committedRuns.slice(
      0,
      committedBeforePendingMessage,
    );
    expect(pendingMessageWrites).toHaveLength(2);
    expect(
      pendingMessageWrites.map((call) => call.statement).join("\n"),
    ).toMatch(/INSERT\s+INTO\s+messages/i);
    expect(
      pendingMessageWrites.map((call) => call.statement).join("\n"),
    ).toMatch(/INSERT\s+INTO\s+outbox_commands/i);
    expect(
      pendingMessageWrites.some((call) => call.values.includes(pending.body)),
    ).toBe(true);
    expect(
      pendingMessageWrites.map((call) => call.statement).join("\n"),
    ).not.toContain(pending.body);
    assertRuntimeValuesAreBound(conversationWrites, [
      "fixture-conversation",
      "fixture",
      "Local fixture",
      100,
    ]);
    assertRuntimeValuesAreBound(pendingMessageWrites, [
      pending.body,
      pending.clientMsgId,
      pending.conversationId,
      pending.createdAtMs,
      pending.localId,
      pending.senderId,
    ]);
    expect(changes).toEqual([
      {
        conversationId: pending.conversationId,
        kind: "message-and-outbox-committed",
      },
    ]);
    expect(notificationTransactionActivity).toEqual([false]);
  });

  test("does not emit a change or commit partial state when an atomic pending-message write fails", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const changes: DatabaseChange[] = [];

    await repository.upsertConversation(createConversation());
    database.failOnRun(database.executedRunCount + 2);
    const unsubscribe = repository.subscribe((change) => changes.push(change));

    await expect(
      repository.enqueuePendingMessage(createPendingMessage()),
    ).rejects.toThrow("synthetic repository write failure");

    unsubscribe();

    expect(database.transactions.at(-1)).toBe("rollback");
    expect(database.committedRuns).toHaveLength(1);
    expect(changes).toEqual([]);
  });

  test("keeps committed pending-message writes and resolves when a subscriber throws", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const pending = createPendingMessage();
    const laterSubscriberChanges: DatabaseChange[] = [];
    const throwingSubscriberTransactionActivity: boolean[] = [];

    await repository.upsertConversation(createConversation());
    const committedBeforePendingMessage = database.committedRuns.length;
    const transactionsBeforePendingMessage = database.transactions.length;
    const unsubscribeThrowing = repository.subscribe(() => {
      throwingSubscriberTransactionActivity.push(database.isTransactionActive);
      throw new Error("synthetic subscriber failure");
    });
    const unsubscribeLater = repository.subscribe((change) => {
      laterSubscriberChanges.push(change);
    });

    await expect(repository.enqueuePendingMessage(pending)).resolves.toEqual({
      body: pending.body,
      clientMsgId: pending.clientMsgId,
      conversationId: pending.conversationId,
      createdAtMs: pending.createdAtMs,
      eventId: null,
      localId: pending.localId,
      senderId: pending.senderId,
      serverSequence: null,
      status: "pending",
    });

    unsubscribeThrowing();
    unsubscribeLater();

    expect(
      database.transactions.slice(transactionsBeforePendingMessage),
    ).toEqual(["commit"]);
    const committedPendingMessageWrites = database.committedRuns.slice(
      committedBeforePendingMessage,
    );
    expect(committedPendingMessageWrites).toHaveLength(2);
    expect(
      committedPendingMessageWrites.map((call) => call.statement).join("\n"),
    ).toMatch(/INSERT\s+INTO\s+messages/i);
    expect(
      committedPendingMessageWrites.map((call) => call.statement).join("\n"),
    ).toMatch(/INSERT\s+INTO\s+outbox_commands/i);
    expect(throwingSubscriberTransactionActivity).toEqual([false]);
    expect(laterSubscriberChanges).toEqual([
      {
        conversationId: pending.conversationId,
        kind: "message-and-outbox-committed",
      },
    ]);
  });

  test("applies a canonical event through one atomic boundary and advances a cursor only monotonically", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    await repository.upsertConversation(createConversation());
    const transactionsBeforeEvents = database.transactions.length;
    const committedRunsBeforeEvents = database.committedRuns.length;
    const changes: DatabaseChange[] = [];
    const notificationTransactionActivity: boolean[] = [];
    const unsubscribe = repository.subscribe((change) => {
      changes.push(change);
      notificationTransactionActivity.push(database.isTransactionActive);
    });

    const result = await repository.applyCanonicalMessageUpsert(
      createCanonicalEvent(5),
    );
    unsubscribe();
    const cursor = await repository.getCursor("fixture-conversation");
    const canonicalWrites = database.committedRuns.slice(
      committedRunsBeforeEvents,
    );

    expect(result).toEqual({ outcome: "applied" });
    expect(cursor).toEqual({
      conversationId: "fixture-conversation",
      cursor: "cursor-5",
      serverSequence: 5,
      updatedAtMs: 300,
    });
    expect(database.transactions.slice(transactionsBeforeEvents)).toEqual([
      "commit",
    ]);
    expect(canonicalWrites).toHaveLength(3);
    expect(canonicalWrites.map((call) => call.statement).join("\n")).toMatch(
      /INSERT\s+INTO\s+messages/i,
    );
    expect(
      database.committedRuns.map((call) => call.statement).join("\n"),
    ).toMatch(/INSERT\s+INTO\s+applied_events/i);
    expect(
      database.committedRuns.map((call) => call.statement).join("\n"),
    ).toMatch(
      /INSERT\s+INTO\s+sync_cursors[\s\S]*ON\s+CONFLICT[\s\S]*excluded\.server_sequence\s*>\s*sync_cursors\.server_sequence/i,
    );
    assertRuntimeValuesAreBound(canonicalWrites, [
      "cursor-5",
      "event-5",
      "canonical message",
      "client-message-1",
      200,
      "local-message-1",
      "fixture-sender",
      "fixture-conversation",
      300,
      5,
    ]);
    expect(changes).toEqual([
      {
        conversationId: "fixture-conversation",
        kind: "canonical-event-applied",
      },
    ]);
    expect(notificationTransactionActivity).toEqual([false]);
  });

  test("treats a duplicate event identifier as a deterministic no-op", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const event = createCanonicalEvent(5);

    await repository.upsertConversation(createConversation());

    await expect(
      repository.applyCanonicalMessageUpsert(event),
    ).resolves.toEqual({
      outcome: "applied",
    });
    await expect(
      repository.applyCanonicalMessageUpsert(event),
    ).resolves.toEqual({
      outcome: "duplicate",
    });
  });

  test("records an unknown event without mutating messages or cursors and makes an exact duplicate a no-op", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const unknownEvent = createUnknownEvent();
    const changes: DatabaseChange[] = [];

    await repository.upsertConversation(createConversation());
    await repository.applyCanonicalMessageUpsert(createCanonicalEvent(5));
    const cursorBeforeUnknownEvent = await repository.getCursor(
      "fixture-conversation",
    );
    const committedBeforeUnknownEvent = database.committedRuns.length;
    const unsubscribe = repository.subscribe((change) => changes.push(change));

    await expect(repository.recordUnknownEvent(unknownEvent)).resolves.toEqual({
      outcome: "recorded",
    });

    const unknownEventWrites = database.committedRuns.slice(
      committedBeforeUnknownEvent,
    );
    const committedBeforeDuplicate = database.committedRuns.length;
    await expect(repository.recordUnknownEvent(unknownEvent)).resolves.toEqual({
      outcome: "duplicate",
    });
    unsubscribe();

    expect(unknownEventWrites).toHaveLength(1);
    expect(unknownEventWrites[0]?.statement).toMatch(
      /INSERT\s+INTO\s+applied_events/i,
    );
    expect(unknownEventWrites[0]?.statement).toMatch(
      /ON\s+CONFLICT\s*\(\s*event_id\s*\)\s+DO\s+NOTHING/i,
    );
    expect(unknownEventWrites[0]?.statement).not.toMatch(
      /INSERT\s+OR\s+IGNORE/i,
    );
    expect(
      unknownEventWrites.map((call) => call.statement).join("\n"),
    ).not.toMatch(/INSERT\s+INTO\s+messages|INSERT\s+INTO\s+sync_cursors/i);
    assertRuntimeValuesAreBound(unknownEventWrites, [
      unknownEvent.conversationId,
      unknownEvent.eventId,
      "unknown_recorded",
      unknownEvent.payloadJson,
      unknownEvent.recordedAtMs,
      unknownEvent.serverSequence,
      unknownEvent.type,
    ]);
    expect(database.committedRuns).toHaveLength(committedBeforeDuplicate);
    await expect(repository.getCursor("fixture-conversation")).resolves.toEqual(
      cursorBeforeUnknownEvent,
    );
    expect(changes).toEqual([]);
  });

  test("does not swallow a non-event-id applied-events constraint conflict", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const changes: DatabaseChange[] = [];

    await repository.upsertConversation(createConversation());
    await repository.recordUnknownEvent(
      createUnknownEvent("event-unknown-1", 6),
    );
    const committedBeforeConflict = database.committedRuns.length;
    const unsubscribe = repository.subscribe((change) => changes.push(change));

    await expect(
      repository.recordUnknownEvent(createUnknownEvent("event-unknown-2", 6)),
    ).rejects.toThrow("synthetic applied-event sequence constraint failure");

    unsubscribe();

    expect(database.committedRuns).toHaveLength(committedBeforeConflict);
    await expect(
      repository.getCursor("fixture-conversation"),
    ).resolves.toBeNull();
    expect(changes).toEqual([]);
  });

  test("does not regress an existing cursor for a later event with a lower server sequence", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);

    await repository.upsertConversation(createConversation());
    await repository.applyCanonicalMessageUpsert(createCanonicalEvent(5));
    await repository.applyCanonicalMessageUpsert(createCanonicalEvent(3));

    await expect(repository.getCursor("fixture-conversation")).resolves.toEqual(
      {
        conversationId: "fixture-conversation",
        cursor: "cursor-5",
        serverSequence: 5,
        updatedAtMs: 300,
      },
    );
  });

  test("leaves messages, cursor writes, and notifications unchanged for a duplicate canonical event", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const event = createCanonicalEvent(5);
    const changes: DatabaseChange[] = [];

    await repository.upsertConversation(createConversation());
    const unsubscribe = repository.subscribe((change) => changes.push(change));
    await repository.applyCanonicalMessageUpsert(event);
    const writesBeforeDuplicate = database.committedRuns.length;

    await expect(
      repository.applyCanonicalMessageUpsert(event),
    ).resolves.toEqual({
      outcome: "duplicate",
    });

    unsubscribe();

    expect(database.committedRuns).toHaveLength(writesBeforeDuplicate);
    expect(changes).toEqual([
      {
        conversationId: "fixture-conversation",
        kind: "canonical-event-applied",
      },
    ]);
  });

  test("rolls back canonical-event writes without notification or cursor advance when a multi-table write fails", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const changes: DatabaseChange[] = [];

    await repository.upsertConversation(createConversation());
    await repository.applyCanonicalMessageUpsert(createCanonicalEvent(5));
    const committedRunsBeforeFailure = database.committedRuns.length;
    database.failOnRun(database.executedRunCount + 2);
    const unsubscribe = repository.subscribe((change) => changes.push(change));

    await expect(
      repository.applyCanonicalMessageUpsert(createCanonicalEvent(6)),
    ).rejects.toThrow("synthetic repository write failure");

    unsubscribe();

    expect(database.transactions.at(-1)).toBe("rollback");
    expect(database.committedRuns).toHaveLength(committedRunsBeforeFailure);
    await expect(repository.getCursor("fixture-conversation")).resolves.toEqual(
      {
        conversationId: "fixture-conversation",
        cursor: "cursor-5",
        serverSequence: 5,
        updatedAtMs: 300,
      },
    );
    expect(changes).toEqual([]);
  });

  test("exposes the repository-owned fixture, bounded page, and same-command retry port", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const repository = createDatabaseRepository(
      new TransactionRecordingDatabase(),
    );
    const fixture = createFixtureSeed();

    expect(typeof repository.listMessagesPage).toBe("function");
    expect(typeof repository.ensureFixtureConversation).toBe("function");
    expect(typeof repository.retryFailedMessage).toBe("function");
    await expect(
      repository.ensureFixtureConversation(fixture),
    ).resolves.toBeUndefined();
  });

  test("returns a bounded compound-cursor page in ascending order while binding the exclusive tuple and limit plus one", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const oldest: Message = {
      body: "oldest",
      clientMsgId: null,
      conversationId: "fixture-conversation",
      createdAtMs: 10,
      eventId: "event-oldest",
      localId: "local-oldest",
      senderId: "fixture-sender",
      serverSequence: 1,
      status: "sent",
    };
    const tiedEarlier: Message = {
      body: "tied earlier",
      clientMsgId: null,
      conversationId: "fixture-conversation",
      createdAtMs: 20,
      eventId: "event-tied-earlier",
      localId: "local-a",
      senderId: "fixture-sender",
      serverSequence: 2,
      status: "sent",
    };
    const newest: Message = {
      body: "newest",
      clientMsgId: null,
      conversationId: "fixture-conversation",
      createdAtMs: 20,
      eventId: "event-newest",
      localId: "local-z",
      senderId: "fixture-sender",
      serverSequence: 3,
      status: "sent",
    };

    database.queueReadRows([
      messageRow(newest),
      messageRow(tiedEarlier),
      messageRow(oldest),
    ]);

    await expect(
      repository.listMessagesPage({
        before: null,
        conversationId: "fixture-conversation",
        limit: 2,
      }),
    ).resolves.toEqual({
      hasMore: true,
      items: [tiedEarlier, newest],
      nextBefore: { createdAtMs: 20, localId: "local-a" },
    });

    const initialPageCall = database.readCalls.at(-1);
    expect(initialPageCall?.statement).toMatch(
      /FROM\s+messages[\s\S]*ORDER\s+BY[\s\S]*created_at_ms\s+DESC[\s\S]*local_id\s+DESC/i,
    );
    expect(initialPageCall?.statement).not.toContain("fixture-conversation");
    expect(initialPageCall?.values).toContain("fixture-conversation");
    expect(initialPageCall?.values).toContain(3);

    database.queueReadRows([messageRow(oldest)]);
    await expect(
      repository.listMessagesPage({
        before: { createdAtMs: 20, localId: "local-a" },
        conversationId: "fixture-conversation",
        limit: 2,
      }),
    ).resolves.toEqual({
      hasMore: false,
      items: [oldest],
      nextBefore: null,
    });

    const olderPageCall = database.readCalls.at(-1);
    expect(olderPageCall?.statement).toMatch(
      /\(\s*created_at_ms\s*,\s*local_id\s*\)\s*<\s*\(\s*\?\s*,\s*\?\s*\)|created_at_ms\s*<\s*\?|created_at_ms\s*=\s*\?\s+AND\s+local_id\s*<\s*\?/i,
    );
    expect(olderPageCall?.values).toEqual(
      expect.arrayContaining(["fixture-conversation", 20, "local-a", 3]),
    );
  });

  test("seeds the typed fixture exactly once and rolls back a same-id different-value collision", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const fixture = createFixtureSeed();
    const changes: DatabaseChange[] = [];
    const unsubscribe = repository.subscribe((change) => changes.push(change));

    await repository.ensureFixtureConversation(fixture);
    const committedAfterFirstSeed = database.committedRuns.length;
    const transactionsAfterFirstSeed = database.transactions.length;

    queuePersistedFixture(database, fixture);
    await expect(
      repository.ensureFixtureConversation(fixture),
    ).resolves.toBeUndefined();
    expect(database.committedRuns).toHaveLength(committedAfterFirstSeed);
    expect(database.transactions.slice(transactionsAfterFirstSeed)).toEqual([
      "commit",
    ]);
    expect(changes).toEqual([]);

    const mismatchedFixture: FixtureConversationSeed = {
      ...fixture,
      conversation: { ...fixture.conversation, title: "different fixture" },
    };
    queuePersistedFixture(database, fixture);
    await expect(
      repository.ensureFixtureConversation(mismatchedFixture),
    ).rejects.toThrow();

    unsubscribe();
    expect(database.transactions.at(-1)).toBe("rollback");
    expect(database.committedRuns).toHaveLength(committedAfterFirstSeed);
    expect(changes).toEqual([]);
  });

  test("accepts the atomic retried fixture pair when startup seeding runs again", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const fixture = createFixtureSeed();
    const failedMessage = fixture.messages.find(
      (message) => message.clientMsgId === "fixture-client-failed-1",
    );
    const failedOutboxCommand = fixture.outboxCommands.find(
      (command) => command.clientMsgId === "fixture-client-failed-1",
    );
    if (
      !failedMessage ||
      failedMessage.clientMsgId === null ||
      !failedOutboxCommand
    ) {
      throw new Error("Fixture failed retry pair is required.");
    }
    const changes: DatabaseChange[] = [];
    const unsubscribe = repository.subscribe((change) => changes.push(change));

    await repository.ensureFixtureConversation(fixture);
    database.queueFirstRow(messageRow(failedMessage));
    database.queueFirstRow(outboxRow(failedOutboxCommand));
    await repository.retryFailedMessage({
      clientMsgId: failedMessage.clientMsgId,
      conversationId: failedMessage.conversationId,
    });

    const writesBeforeRestart = database.committedRuns.length;
    const transactionsBeforeRestart = database.transactions.length;
    queuePersistedFixtureRetrySnapshot(database, fixture, {
      clientMsgId: failedOutboxCommand.clientMsgId,
      messageStatus: "pending",
      outboxState: "queued",
    });

    await expect(
      repository.ensureFixtureConversation(fixture),
    ).resolves.toBeUndefined();
    unsubscribe();

    expect(database.committedRuns).toHaveLength(writesBeforeRestart);
    expect(database.transactions.slice(transactionsBeforeRestart)).toEqual([
      "commit",
    ]);
    expect(changes).toEqual([
      {
        conversationId: "fixture-conversation",
        kind: "message-retry-committed",
      },
    ]);
  });

  const invalidFixtureRetrySnapshots: readonly (PersistedFixtureRetrySnapshot &
    Readonly<{ caseName: string }>)[] = [
    {
      caseName: "message-only transition",
      clientMsgId: "fixture-client-failed-1",
      messageStatus: "pending",
      outboxState: "failed",
    },
    {
      caseName: "outbox-only transition",
      clientMsgId: "fixture-client-failed-1",
      messageStatus: "failed",
      outboxState: "queued",
    },
    {
      caseName: "message content drift",
      clientMsgId: "fixture-client-failed-1",
      messageBody: "tampered fixture message",
      messageStatus: "pending",
      outboxState: "queued",
    },
    {
      caseName: "outbox content drift",
      clientMsgId: "fixture-client-failed-1",
      messageStatus: "pending",
      outboxBody: "tampered fixture command",
      outboxState: "queued",
    },
  ];

  test.each(invalidFixtureRetrySnapshots)(
    "rejects a persisted fixture retry pair with $caseName",
    async (snapshot) => {
      const createDatabaseRepository = loadCreateDatabaseRepository();
      const database = new TransactionRecordingDatabase();
      const repository = createDatabaseRepository(database);
      const fixture = createFixtureSeed();

      queuePersistedFixtureRetrySnapshot(database, fixture, snapshot);

      await expect(
        repository.ensureFixtureConversation(fixture),
      ).rejects.toThrow(/Fixture (?:message|outbox command) conflicts/);
      expect(database.transactions).toEqual(["rollback"]);
      expect(database.committedRuns).toEqual([]);
    },
  );

  test("preserves a non-seeded user message and outbox byte-for-byte when the fixture seed is rerun", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const fixture = createFixtureSeed();
    const userMessage = {
      ...createPendingMessage(),
      body: "user-created row survives fixture rerun",
      clientMsgId: "client-user-preserved-1",
      localId: "local-user-preserved-1",
    };
    const changes: DatabaseChange[] = [];
    const unsubscribe = repository.subscribe((change) => changes.push(change));

    await repository.ensureFixtureConversation(fixture);
    await repository.enqueuePendingMessage(userMessage);
    const preservedRows = database.committedRuns
      .filter((call) => call.values.includes(userMessage.clientMsgId))
      .map((call) => ({ statement: call.statement, values: [...call.values] }));
    const writesBeforeRerun = database.committedRuns.length;
    const notificationsBeforeRerun = [...changes];

    queuePersistedFixture(
      database,
      fixture,
      [
        {
          body: userMessage.body,
          clientMsgId: userMessage.clientMsgId,
          conversationId: userMessage.conversationId,
          createdAtMs: userMessage.createdAtMs,
          eventId: null,
          localId: userMessage.localId,
          senderId: userMessage.senderId,
          serverSequence: null,
          status: "pending",
        },
      ],
      [
        {
          body: userMessage.body,
          client_msg_id: userMessage.clientMsgId,
          command_id: "outbox:client-user-preserved-1",
          command_type: "message.create",
          conversation_id: userMessage.conversationId,
          created_at_ms: userMessage.createdAtMs,
          state: "queued",
        },
      ],
    );
    await repository.ensureFixtureConversation(fixture);
    unsubscribe();

    expect(database.committedRuns).toHaveLength(writesBeforeRerun);
    expect(
      database.committedRuns
        .filter((call) => call.values.includes(userMessage.clientMsgId))
        .map((call) => ({
          statement: call.statement,
          values: [...call.values],
        })),
    ).toEqual(preservedRows);
    expect(changes).toEqual(notificationsBeforeRerun);
  });

  test("retries the existing failed message and outbox atomically with identity and body reuse", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const failedMessage = createFixtureSeed().messages[1];
    if (!failedMessage) throw new Error("Fixture failed message is required.");
    const changes: DatabaseChange[] = [];

    database.queueFirstRow(messageRow(failedMessage));
    database.queueFirstRow({
      body: failedMessage.body,
      client_msg_id: "fixture-client-failed-1",
      command_id: "outbox:fixture-client-failed-1",
      command_type: "message.create",
      conversation_id: "fixture-conversation",
      created_at_ms: failedMessage.createdAtMs,
      state: "failed",
    });
    const unsubscribe = repository.subscribe((change) => changes.push(change));
    const writesBeforeRetry = database.committedRuns.length;

    await expect(
      repository.retryFailedMessage({
        clientMsgId: "fixture-client-failed-1",
        conversationId: "fixture-conversation",
      }),
    ).resolves.toEqual({ ...failedMessage, status: "pending" });

    unsubscribe();
    const retryWrites = database.committedRuns.slice(writesBeforeRetry);
    expect(retryWrites).toHaveLength(2);
    expect(retryWrites.map((call) => call.statement).join("\n")).toMatch(
      /UPDATE\s+messages/i,
    );
    expect(retryWrites.map((call) => call.statement).join("\n")).toMatch(
      /UPDATE\s+outbox_commands/i,
    );
    expect(retryWrites.map((call) => call.statement).join("\n")).not.toMatch(
      /INSERT\s+INTO\s+(?:messages|outbox_commands)/i,
    );
    const retrySql = retryWrites.map((call) => call.statement).join("\n");
    const retryBoundValues = retryWrites.flatMap((call) => call.values);
    expect(retryBoundValues).toEqual(
      expect.arrayContaining([
        "fixture-client-failed-1",
        "outbox:fixture-client-failed-1",
      ]),
    );
    expect(retrySql).not.toContain("fixture-client-failed-1");
    expect(retrySql).not.toContain("outbox:fixture-client-failed-1");
    expect(`${retrySql}\n${retryBoundValues.join("\n")}`).toEqual(
      expect.stringContaining("failed"),
    );
    expect(`${retrySql}\n${retryBoundValues.join("\n")}`).toEqual(
      expect.stringContaining("pending"),
    );
    expect(`${retrySql}\n${retryBoundValues.join("\n")}`).toEqual(
      expect.stringContaining("queued"),
    );
    expect(changes).toEqual([
      {
        conversationId: "fixture-conversation",
        kind: "message-retry-committed",
      },
    ]);
  });

  test("rolls back retry partial failure and leaves unrelated subscribers without a retry notification", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const failedMessage = createFixtureSeed().messages[1];
    if (!failedMessage) throw new Error("Fixture failed message is required.");
    const changes: DatabaseChange[] = [];

    database.queueFirstRow(messageRow(failedMessage));
    database.queueFirstRow({
      body: failedMessage.body,
      client_msg_id: "fixture-client-failed-1",
      command_id: "outbox:fixture-client-failed-1",
      command_type: "message.create",
      conversation_id: "fixture-conversation",
      created_at_ms: failedMessage.createdAtMs,
      state: "failed",
    });
    database.failOnRun(database.executedRunCount + 2);
    const unsubscribe = repository.subscribe((change) => changes.push(change));
    const writesBeforeRetry = database.committedRuns.length;

    await expect(
      repository.retryFailedMessage({
        clientMsgId: "fixture-client-failed-1",
        conversationId: "fixture-conversation",
      }),
    ).rejects.toThrow("synthetic repository write failure");

    unsubscribe();
    expect(database.transactions.at(-1)).toBe("rollback");
    expect(database.committedRuns).toHaveLength(writesBeforeRetry);
    expect(changes).toEqual([]);
  });

  test("does not notify an unsubscribed unrelated listener when a retry commits", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const failedMessage = createFixtureSeed().messages[1];
    if (!failedMessage) throw new Error("Fixture failed message is required.");
    const unrelatedChanges: DatabaseChange[] = [];

    database.queueFirstRow(messageRow(failedMessage));
    database.queueFirstRow({
      body: failedMessage.body,
      client_msg_id: "fixture-client-failed-1",
      command_id: "outbox:fixture-client-failed-1",
      command_type: "message.create",
      conversation_id: "fixture-conversation",
      created_at_ms: failedMessage.createdAtMs,
      state: "failed",
    });
    const unsubscribe = repository.subscribe((change) => {
      unrelatedChanges.push(change);
    });
    unsubscribe();

    await expect(
      repository.retryFailedMessage({
        clientMsgId: "fixture-client-failed-1",
        conversationId: "fixture-conversation",
      }),
    ).resolves.toEqual({ ...failedMessage, status: "pending" });

    expect(unrelatedChanges).toEqual([]);
  });

  test("rejects unknown, already-retried, wrong-conversation, and missing-outbox retry requests without writes or notifications", async () => {
    const createDatabaseRepository = loadCreateDatabaseRepository();
    const database = new TransactionRecordingDatabase();
    const repository = createDatabaseRepository(database);
    const failedMessage = createFixtureSeed().messages[1];
    if (!failedMessage) throw new Error("Fixture failed message is required.");
    const alreadyRetriedMessage: Message = {
      ...failedMessage,
      clientMsgId: "fixture-client-pending-1",
      localId: "fixture-message-pending",
      status: "pending",
    };
    const changes: DatabaseChange[] = [];
    const unsubscribe = repository.subscribe((change) => changes.push(change));
    const writesBeforeRetries = database.committedRuns.length;

    await expect(
      repository.retryFailedMessage({
        clientMsgId: "unknown-client-message",
        conversationId: "fixture-conversation",
      }),
    ).rejects.toThrow();
    database.queueFirstRow(messageRow(alreadyRetriedMessage));
    await expect(
      repository.retryFailedMessage({
        clientMsgId: "fixture-client-pending-1",
        conversationId: "fixture-conversation",
      }),
    ).rejects.toThrow();
    database.queueFirstRow(messageRow(failedMessage));
    await expect(
      repository.retryFailedMessage({
        clientMsgId: "fixture-client-failed-1",
        conversationId: "different-conversation",
      }),
    ).rejects.toThrow();
    database.queueFirstRow(messageRow(failedMessage));
    await expect(
      repository.retryFailedMessage({
        clientMsgId: "fixture-client-failed-1",
        conversationId: "fixture-conversation",
      }),
    ).rejects.toThrow();

    unsubscribe();
    expect(database.committedRuns).toHaveLength(writesBeforeRetries);
    expect(changes).toEqual([]);
  });

  test("keeps the database boundary free of transport, identity, UI, and M5/M6 imports", () => {
    const { fileSystem, path } = loadNodeModules();
    const databaseRoot = path.resolve(process.cwd(), "src/core/database");
    const databaseProviderPath = path.join(
      databaseRoot,
      "database-provider.tsx",
    );
    const sourceFiles = listSourceFiles(databaseRoot, fileSystem, path).filter(
      (sourcePath) => [".ts", ".tsx"].includes(path.extname(sourcePath)),
    );
    const source = sourceFiles
      .map((sourcePath) => fileSystem.readFileSync(sourcePath, "utf8"))
      .join("\n");
    const featureFreeSource = sourceFiles
      .filter((sourcePath) => sourcePath !== databaseProviderPath)
      .map((sourcePath) => fileSystem.readFileSync(sourcePath, "utf8"))
      .join("\n");
    const databaseProviderSource = fileSystem.readFileSync(
      databaseProviderPath,
      "utf8",
    );
    const databaseProviderFeatureImports = [
      ...databaseProviderSource.matchAll(
        /from\s+["']([^"']*(?:app|features)[^"']*)["']/g,
      ),
    ].map((match) => match[1]);

    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bWebSocket\b|\bEventSource\b|\bNetInfo\b/);
    expect(source).not.toMatch(/\btoken\b|\bcredential\b|\bSecureStore\b/);
    expect(featureFreeSource).not.toMatch(
      /from\s+["'][^"']*(?:app|features)[^"']*["']/,
    );
    expect(databaseProviderFeatureImports).toEqual([
      "@/features/chat/model/chat-fixture",
    ]);
  });
});
