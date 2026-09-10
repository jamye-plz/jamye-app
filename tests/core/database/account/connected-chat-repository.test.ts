import { createConnectedChatRepository } from "../../../../src/core/database/account/connected-chat-repository";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedHistoryMessageUpsert,
} from "../../../../src/core/database/account/connected-chat-types";
import type {
  SqliteRepositoryDatabase,
  SqliteRow,
  SqliteRunResult,
  SqliteValue,
} from "../../../../src/core/database/types";

type ChildProcessModule = Readonly<{
  execFileSync: (
    file: string,
    args: readonly string[],
    options: Readonly<{ cwd: string; encoding: "utf8" }>,
  ) => string;
}>;

type RunCall = Readonly<{
  statement: string;
  values: readonly SqliteValue[];
}>;

class ScriptedDatabase implements SqliteRepositoryDatabase {
  readonly runCalls: RunCall[] = [];
  commits = 0;
  rollbacks = 0;
  transactions = 0;
  failRunAt: number | null = null;
  private readonly allResults: SqliteRow[][] = [];
  private readonly firstResults: (SqliteRow | null)[] = [];

  queueAll(...results: readonly SqliteRow[][]): void {
    this.allResults.push(...results);
  }

  queueFirst(...results: readonly (SqliteRow | null)[]): void {
    this.firstResults.push(...results);
  }

  async getAllAsync<Row extends SqliteRow>(
    _statement: string,
    ..._values: SqliteValue[]
  ): Promise<Row[]> {
    return (this.allResults.shift() ?? []) as Row[];
  }

  async getFirstAsync<Row extends SqliteRow>(
    _statement: string,
    ..._values: SqliteValue[]
  ): Promise<Row | null> {
    return (this.firstResults.shift() ?? null) as Row | null;
  }

  async runAsync(
    statement: string,
    ...values: SqliteValue[]
  ): Promise<SqliteRunResult> {
    this.runCalls.push({ statement, values });
    if (this.failRunAt === this.runCalls.length) {
      throw new Error("synthetic SQL write failure");
    }
    return { changes: 1, lastInsertRowId: this.runCalls.length };
  }

  async withExclusiveTransactionAsync(
    operation: (transaction: SqliteRepositoryDatabase) => Promise<void>,
  ): Promise<void> {
    this.transactions += 1;
    try {
      await operation(this);
      this.commits += 1;
    } catch (error) {
      this.rollbacks += 1;
      throw error;
    }
  }
}

const PRINCIPAL = Object.freeze({
  epoch: 9,
  origin: "https://api.jamye.example",
  userId: "aaaaaaaa-1111-4111-8111-111111111111",
});
const CHATROOM_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const GROUP_ID = "cccccccc-3333-4333-8333-333333333333";
const CLIENT_MSG_ID = "dddddddd-4444-4444-8444-444444444444";
const SERVER_MESSAGE_ID = "eeeeeeee-5555-4555-8555-555555555555";

function messageRow(overrides: Partial<SqliteRow> = {}): SqliteRow {
  return {
    body: "  exact body\n",
    chatroom_id: CHATROOM_ID,
    client_msg_id: CLIENT_MSG_ID,
    created_at_raw: "2026-09-10T00:00:00.123456789Z",
    kind: "user",
    local_created_at_ms: 1_788_998_400_123,
    local_id: "local-one",
    media_json: "[]",
    sender_avatar_url: "https://cdn.example/avatar.png",
    sender_id: PRINCIPAL.userId,
    sender_nickname: "포비",
    server_message_id: SERVER_MESSAGE_ID,
    sort_nanos: 123_456_789,
    sort_seconds: 1_788_998_400,
    sort_tiebreaker: SERVER_MESSAGE_ID,
    status: "sent",
    ...overrides,
  };
}

function outboxRow(overrides: Partial<SqliteRow> = {}): SqliteRow {
  return {
    body: "  exact body\n",
    chatroom_id: CHATROOM_ID,
    client_msg_id: CLIENT_MSG_ID,
    command_id: "ffffffff-6666-4666-8666-666666666666",
    error_code: null,
    local_id: "local-one",
    state: "queued",
    ...overrides,
  };
}

function historyInput(
  overrides: Partial<ConnectedHistoryMessageUpsert> = {},
): ConnectedHistoryMessageUpsert {
  return {
    body: "  exact body\n",
    chatroomId: CHATROOM_ID,
    clientMsgId: CLIENT_MSG_ID,
    createdAtRaw: "2026-09-10T00:00:00.123456789Z",
    kind: "user",
    localId: "proposed-history-local",
    media: [],
    senderAvatarUrl: "https://cdn.example/avatar.png",
    senderId: PRINCIPAL.userId,
    senderNickname: "포비",
    serverMessageId: SERVER_MESSAGE_ID,
    ...overrides,
  };
}

function canonicalInput(
  overrides: Partial<ConnectedCanonicalMessageUpsert> = {},
): ConnectedCanonicalMessageUpsert {
  return {
    body: "  exact body\n",
    chatroomId: CHATROOM_ID,
    clientMsgId: CLIENT_MSG_ID,
    createdAtRaw: "2026-09-10T00:00:00.123456789Z",
    kind: "user",
    localId: "proposed-canonical-local",
    media: [],
    senderId: PRINCIPAL.userId,
    serverMessageId: SERVER_MESSAGE_ID,
    ...overrides,
  };
}

function createRepository(
  database: ScriptedDatabase,
  assertActive: () => void = jest.fn(),
) {
  return createConnectedChatRepository(database, PRINCIPAL, assertActive);
}

describe("M8 account-scoped connected chat SQLite repository", () => {
  test("passes the disposable real-SQLite migration and repository scenarios", () => {
    const { execFileSync } =
      jest.requireActual<ChildProcessModule>("node:child_process");

    const output = execFileSync(
      "bun",
      ["tests/core/database/account/connected-chat-repository.bun.ts"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output.trim()).toBe("connected-chat-sqlite: PASS");
  });

  test("fences stale leases and rejects invalid bounds, timestamps, and pending payloads before writes", async () => {
    const staleDatabase = new ScriptedDatabase();
    const stale = createRepository(staleDatabase, () => {
      throw new Error("account handle is stale");
    });

    await expect(
      stale.listChatrooms({ after: null, groupId: GROUP_ID, limit: 20 }),
    ).rejects.toThrow(/stale/i);
    expect(staleDatabase.transactions).toBe(0);

    const database = new ScriptedDatabase();
    const repository = createRepository(database);
    await expect(
      repository.listChatrooms({ after: null, groupId: GROUP_ID, limit: 0 }),
    ).rejects.toThrow(/1 through 100/i);
    await expect(
      repository.listMessagesWindow({
        before: null,
        chatroomId: CHATROOM_ID,
        limit: 101,
      }),
    ).rejects.toThrow(/1 through 100/i);
    await expect(
      repository.upsertChatrooms([
        {
          chatroomId: CHATROOM_ID,
          createdAtRaw: "not-rfc3339",
          groupId: GROUP_ID,
          kind: "main",
          topicId: null,
        },
      ]),
    ).rejects.toThrow(/RFC3339/i);
    await expect(
      repository.upsertChatrooms([
        {
          chatroomId: CHATROOM_ID,
          createdAtRaw: "2026-99-99T00:00:00Z",
          groupId: GROUP_ID,
          kind: "main",
          topicId: null,
        },
      ]),
    ).rejects.toThrow(/valid RFC3339/i);
    await expect(
      repository.enqueuePendingMessage({
        body: "",
        chatroomId: CHATROOM_ID,
        clientMsgId: CLIENT_MSG_ID,
        commandId: "command-empty",
        localCreatedAtMs: 1,
        localId: "local-empty",
      }),
    ).rejects.toThrow(/must not be empty/i);
    await expect(
      repository.enqueuePendingMessage({
        body: "body",
        chatroomId: CHATROOM_ID,
        clientMsgId: CLIENT_MSG_ID,
        commandId: "command-unsafe-time",
        localCreatedAtMs: Number.MAX_SAFE_INTEGER + 1,
        localId: "local-unsafe-time",
      }),
    ).rejects.toThrow(/safe integer/i);
  });

  test("writes chatrooms transactionally and maps bounded indexed pages with and without cursors", async () => {
    const database = new ScriptedDatabase();
    const repository = createRepository(database);

    await repository.upsertChatrooms([
      {
        chatroomId: CHATROOM_ID,
        createdAtRaw: "2026-09-10T09:00:00.000000001+09:00",
        groupId: GROUP_ID,
        kind: "main",
        topicId: null,
      },
      {
        chatroomId: "bbbbbbbb-2222-4222-8222-333333333333",
        createdAtRaw: "2026-09-10T00:00:00.000000002Z",
        groupId: GROUP_ID,
        kind: "topic",
        topicId: "99999999-8888-4888-8888-888888888888",
      },
    ]);

    expect(database.commits).toBe(1);
    expect(database.runCalls).toHaveLength(2);
    expect(database.runCalls[0]?.values.slice(-2)).toEqual([1_788_998_400, 1]);

    const firstRow = {
      chatroom_id: CHATROOM_ID,
      created_at_raw: "2026-09-10T00:00:00.000000001Z",
      group_id: GROUP_ID,
      kind: "main",
      sort_nanos: 1,
      sort_seconds: 1_788_998_400,
      topic_id: null,
    };
    const secondRow = {
      ...firstRow,
      chatroom_id: "bbbbbbbb-2222-4222-8222-333333333333",
      kind: "topic",
      sort_nanos: 2,
      topic_id: "99999999-8888-4888-8888-888888888888",
    };
    database.queueAll([firstRow, secondRow], [secondRow], []);

    const firstPage = await repository.listChatrooms({
      after: null,
      groupId: GROUP_ID,
      limit: 1,
    });
    expect(firstPage).toEqual({
      hasMore: true,
      items: [
        {
          chatroomId: CHATROOM_ID,
          createdAtRaw: firstRow.created_at_raw,
          groupId: GROUP_ID,
          kind: "main",
          topicId: null,
        },
      ],
      nextAfter: {
        chatroomId: CHATROOM_ID,
        sortNanos: 1,
        sortSeconds: 1_788_998_400,
      },
    });
    const finalPage = await repository.listChatrooms({
      after: firstPage.nextAfter,
      groupId: GROUP_ID,
      limit: 2,
    });
    expect(finalPage.hasMore).toBe(false);
    expect(finalPage.nextAfter).toEqual({
      chatroomId: secondRow.chatroom_id,
      sortNanos: secondRow.sort_nanos,
      sortSeconds: secondRow.sort_seconds,
    });
    expect(finalPage.items[0]?.kind).toBe("topic");

    const emptyPage = await repository.listChatrooms({
      after: finalPage.nextAfter,
      groupId: GROUP_ID,
      limit: 2,
    });
    expect(emptyPage).toEqual({
      hasMore: false,
      items: [],
      nextAfter: null,
    });
  });

  test("atomically persists an exact pending intent and surfaces partial-write and missing-row failures", async () => {
    const database = new ScriptedDatabase();
    database.queueFirst(
      messageRow({
        created_at_raw: null,
        server_message_id: null,
        sort_nanos: 123_000_000,
        sort_tiebreaker: "local-one",
        status: "pending",
      }),
      outboxRow(),
    );
    const repository = createRepository(database);

    const result = await repository.enqueuePendingMessage({
      body: "  exact body\n",
      chatroomId: CHATROOM_ID,
      clientMsgId: CLIENT_MSG_ID,
      commandId: "ffffffff-6666-4666-8666-666666666666",
      localCreatedAtMs: 1_788_998_400_123,
      localId: "local-one",
    });

    expect(database.transactions).toBe(1);
    expect(database.runCalls).toHaveLength(2);
    expect(result.command.body).toBe("  exact body\n");
    expect(result.message.localId).toBe("local-one");

    const failingDatabase = new ScriptedDatabase();
    failingDatabase.failRunAt = 2;
    await expect(
      createRepository(failingDatabase).enqueuePendingMessage({
        body: "body",
        chatroomId: CHATROOM_ID,
        clientMsgId: CLIENT_MSG_ID,
        commandId: "command-fail",
        localCreatedAtMs: 123,
        localId: "local-fail",
      }),
    ).rejects.toThrow(/synthetic SQL write failure/i);
    expect(failingDatabase.rollbacks).toBe(1);

    const missingRows = new ScriptedDatabase();
    missingRows.queueFirst(null, null);
    await expect(
      createRepository(missingRows).enqueuePendingMessage({
        body: "body",
        chatroomId: CHATROOM_ID,
        clientMsgId: CLIENT_MSG_ID,
        commandId: "command-missing",
        localCreatedAtMs: 123,
        localId: "local-missing",
      }),
    ).rejects.toThrow(/both rows/i);
  });

  test("converges history-first and response-first canonical rows while applying source-aware profile semantics", async () => {
    const database = new ScriptedDatabase();
    const repository = createRepository(database);
    const historyMerged = messageRow();
    const historyCleared = messageRow({
      sender_avatar_url: null,
      sender_nickname: null,
    });
    database.queueFirst(
      null,
      null,
      historyMerged,
      historyMerged,
      historyCleared,
    );

    await repository.mergeHistoryMessages([
      historyInput(),
      historyInput({ senderAvatarUrl: null, senderNickname: null }),
    ]);

    const messageUpdates = database.runCalls.filter(({ statement }) =>
      /UPDATE connected_chat_messages SET/i.test(statement),
    );
    expect(messageUpdates.at(-1)?.values[4]).toBeNull();
    expect(messageUpdates.at(-1)?.values[5]).toBeNull();

    const canonicalDatabase = new ScriptedDatabase();
    canonicalDatabase.queueFirst(historyMerged, historyMerged);
    const canonical =
      await createRepository(canonicalDatabase).mergeCanonicalMessage(
        canonicalInput(),
      );
    const canonicalUpdate = canonicalDatabase.runCalls.find(({ statement }) =>
      /UPDATE connected_chat_messages SET/i.test(statement),
    );
    expect(canonical.localId).toBe("local-one");
    expect(canonicalUpdate?.values[4]).toBe("포비");
    expect(canonicalUpdate?.values[5]).toBe("https://cdn.example/avatar.png");
    expect(
      canonicalDatabase.runCalls.some(({ statement }) =>
        /SET state = 'acked'/i.test(statement),
      ),
    ).toBe(true);

    const responseFirstDatabase = new ScriptedDatabase();
    const responseFirstRow = messageRow({
      client_msg_id: "12121212-7777-4777-8777-777777777777",
      local_id: "response-first-local",
      sender_avatar_url: null,
      sender_id: "13131313-8888-4888-8888-888888888888",
      sender_nickname: null,
      server_message_id: "14141414-9999-4999-8999-999999999999",
      sort_tiebreaker: "14141414-9999-4999-8999-999999999999",
    });
    responseFirstDatabase.queueFirst(
      null,
      null,
      responseFirstRow,
      responseFirstRow,
      {
        ...responseFirstRow,
        sender_nickname: "보강됨",
      },
    );
    const responseFirstRepository = createRepository(responseFirstDatabase);
    await responseFirstRepository.mergeCanonicalMessage(
      canonicalInput({
        clientMsgId: responseFirstRow.client_msg_id as string,
        localId: "response-first-local",
        senderId: responseFirstRow.sender_id as string,
        serverMessageId: responseFirstRow.server_message_id as string,
      }),
    );
    await responseFirstRepository.mergeHistoryMessages([
      historyInput({
        clientMsgId: responseFirstRow.client_msg_id as string,
        localId: "history-proposed-local",
        senderAvatarUrl: null,
        senderId: responseFirstRow.sender_id as string,
        senderNickname: "보강됨",
        serverMessageId: responseFirstRow.server_message_id as string,
      }),
    ]);
    expect(
      responseFirstDatabase.runCalls.filter(({ statement }) =>
        /INSERT INTO connected_chat_messages/i.test(statement),
      ),
    ).toHaveLength(1);

    const nullableDatabase = new ScriptedDatabase();
    const nullableRow = messageRow({
      body: null,
      client_msg_id: null,
      media_json: "[]",
      sender_id: null,
    });
    nullableDatabase.queueFirst(null, nullableRow);
    const nullable = await createRepository(
      nullableDatabase,
    ).mergeCanonicalMessage(
      canonicalInput({ body: null, clientMsgId: null, senderId: null }),
    );
    expect(nullable.body).toBeNull();
    expect(nullable.media).toEqual([]);
  });

  test("maps exact ordered message windows and rejects malformed persisted media", async () => {
    const database = new ScriptedDatabase();
    const repository = createRepository(database);
    const older = messageRow({
      local_id: "older",
      server_message_id: "00000000-0000-4000-8000-000000000001",
      sort_nanos: 123_456_788,
      sort_tiebreaker: "00000000-0000-4000-8000-000000000001",
    });
    const newer = messageRow();
    database.queueAll([newer, older], [older], []);

    const page = await repository.listMessagesWindow({
      before: null,
      chatroomId: CHATROOM_ID,
      limit: 1,
    });
    expect(page.hasMore).toBe(true);
    expect(page.items.map(({ localId }) => localId)).toEqual(["local-one"]);
    expect(page.nextBefore).toEqual({
      localId: "local-one",
      sortNanos: 123_456_789,
      sortSeconds: 1_788_998_400,
      sortTieBreaker: SERVER_MESSAGE_ID,
    });

    const finalPage = await repository.listMessagesWindow({
      before: page.nextBefore,
      chatroomId: CHATROOM_ID,
      limit: 2,
    });
    expect(finalPage.hasMore).toBe(false);
    expect(finalPage.nextBefore).toEqual({
      localId: "older",
      sortNanos: 123_456_788,
      sortSeconds: 1_788_998_400,
      sortTieBreaker: "00000000-0000-4000-8000-000000000001",
    });
    expect(finalPage.items[0]?.createdAtRaw).toBe(
      "2026-09-10T00:00:00.123456789Z",
    );

    const emptyPage = await repository.listMessagesWindow({
      before: finalPage.nextBefore,
      chatroomId: CHATROOM_ID,
      limit: 2,
    });
    expect(emptyPage).toEqual({
      hasMore: false,
      items: [],
      nextBefore: null,
    });

    const corruptDatabase = new ScriptedDatabase();
    corruptDatabase.queueAll([messageRow({ media_json: "{}" })]);
    await expect(
      createRepository(corruptDatabase).listMessagesWindow({
        before: null,
        chatroomId: CHATROOM_ID,
        limit: 1,
      }),
    ).rejects.toThrow(/not an array/i);
  });

  test("reads and fails safe outbox attempts without storing raw errors", async () => {
    const database = new ScriptedDatabase();
    database.queueFirst(null, outboxRow());
    const repository = createRepository(database);
    await expect(repository.getOutboxCommand("missing")).resolves.toBeNull();
    await expect(repository.getOutboxCommand(CLIENT_MSG_ID)).resolves.toEqual({
      body: "  exact body\n",
      chatroomId: CHATROOM_ID,
      clientMsgId: CLIENT_MSG_ID,
      commandId: "ffffffff-6666-4666-8666-666666666666",
      errorCode: null,
      localId: "local-one",
      state: "queued",
    });

    const missingDatabase = new ScriptedDatabase();
    missingDatabase.queueFirst(null);
    await expect(
      createRepository(missingDatabase).markSendFailed({
        clientMsgId: CLIENT_MSG_ID,
        errorCode: "network",
      }),
    ).rejects.toThrow(/not found/i);

    const failureDatabase = new ScriptedDatabase();
    failureDatabase.queueFirst(outboxRow());
    await createRepository(failureDatabase).markSendFailed({
      clientMsgId: CLIENT_MSG_ID,
      errorCode: "server_unavailable",
    });
    expect(failureDatabase.runCalls[0]?.values[0]).toBe("server_unavailable");
    expect(failureDatabase.runCalls).toHaveLength(2);
  });

  test("retries only the same failed UUID, room, and byte-exact body while retaining identities", async () => {
    const missingDatabase = new ScriptedDatabase();
    missingDatabase.queueFirst(null);
    await expect(
      createRepository(missingDatabase).retryFailedMessage({
        body: "  exact body\n",
        chatroomId: CHATROOM_ID,
        clientMsgId: CLIENT_MSG_ID,
      }),
    ).rejects.toThrow(/not found/i);

    const queuedDatabase = new ScriptedDatabase();
    queuedDatabase.queueFirst(outboxRow({ state: "queued" }));
    await expect(
      createRepository(queuedDatabase).retryFailedMessage({
        body: "  exact body\n",
        chatroomId: CHATROOM_ID,
        clientMsgId: CLIENT_MSG_ID,
      }),
    ).rejects.toThrow(/not found/i);

    const mismatchDatabase = new ScriptedDatabase();
    mismatchDatabase.queueFirst(outboxRow({ state: "failed" }));
    await expect(
      createRepository(mismatchDatabase).retryFailedMessage({
        body: "exact body\n",
        chatroomId: CHATROOM_ID,
        clientMsgId: CLIENT_MSG_ID,
      }),
    ).rejects.toThrow(/immutable room and exact body/i);

    const successDatabase = new ScriptedDatabase();
    successDatabase.queueFirst(
      outboxRow({ error_code: "network", state: "failed" }),
      messageRow({ status: "pending" }),
      outboxRow({ state: "queued" }),
    );
    const retried = await createRepository(successDatabase).retryFailedMessage({
      body: "  exact body\n",
      chatroomId: CHATROOM_ID,
      clientMsgId: CLIENT_MSG_ID,
    });
    expect(retried.message.localId).toBe("local-one");
    expect(retried.command.commandId).toBe(
      "ffffffff-6666-4666-8666-666666666666",
    );
    expect(retried.command.state).toBe("queued");

    const lostRowsDatabase = new ScriptedDatabase();
    lostRowsDatabase.queueFirst(
      outboxRow({ state: "failed" }),
      null,
      outboxRow({ state: "queued" }),
    );
    await expect(
      createRepository(lostRowsDatabase).retryFailedMessage({
        body: "  exact body\n",
        chatroomId: CHATROOM_ID,
        clientMsgId: CLIENT_MSG_ID,
      }),
    ).rejects.toThrow(/retain its rows/i);
  });
});
