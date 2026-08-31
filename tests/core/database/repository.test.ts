type SqliteValue = string | number | null;

type SqliteRunResult = Readonly<{
  changes: number;
  lastInsertRowId: number;
}>;

type SqliteDatabase = {
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
  kind: "message-and-outbox-committed" | "canonical-event-applied";
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

type DatabaseRepository = {
  applyCanonicalMessageUpsert: (
    event: CanonicalMessageUpsert,
  ) => Promise<ApplyCanonicalResult>;
  enqueuePendingMessage: (input: PendingMessageInput) => Promise<Message>;
  getCursor: (conversationId: string) => Promise<SyncCursor | null>;
  recordUnknownEvent: (
    event: UnknownEventInput,
  ) => Promise<RecordUnknownEventResult>;
  subscribe: (listener: (change: DatabaseChange) => void) => () => void;
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
  readonly transactions: ("commit" | "rollback")[] = [];
  private committedEventIds = new Set<string>();
  private committedEventSequenceKeys = new Set<string>();
  private committedCursor?: SyncCursor;
  private failAtRun?: number;
  private pendingCursor?: SyncCursor;
  private pendingEventIds?: Set<string>;
  private pendingEventSequenceKeys?: Set<string>;
  private pendingRuns?: RunCall[];
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

  async getFirstAsync<Row extends Record<string, SqliteValue>>(
    statement: string,
    ...values: SqliteValue[]
  ): Promise<Row | null> {
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

  test("keeps the database boundary free of transport, identity, UI, and M5/M6 imports", () => {
    const { fileSystem, path } = loadNodeModules();
    const databaseRoot = path.resolve(process.cwd(), "src/core/database");
    const sourceFiles = listSourceFiles(databaseRoot, fileSystem, path).filter(
      (sourcePath) => [".ts", ".tsx"].includes(path.extname(sourcePath)),
    );
    const source = sourceFiles
      .map((sourcePath) => fileSystem.readFileSync(sourcePath, "utf8"))
      .join("\n");

    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bWebSocket\b|\bEventSource\b|\bNetInfo\b/);
    expect(source).not.toMatch(/\btoken\b|\bcredential\b|\bSecureStore\b/);
    expect(source).not.toMatch(/from\s+["'][^"']*(?:app|features)[^"']*["']/);
  });
});
