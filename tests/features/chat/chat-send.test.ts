type ClockPort = Readonly<{ nowMs: () => number }>;
type MessageIdentityPort = Readonly<{
  next: () => Readonly<{ clientMsgId: string; localId: string }>;
}>;
type FileSystemModule = Readonly<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>;
type PendingMessage = Readonly<{
  body: string;
  clientMsgId: string;
  conversationId: string;
  createdAtMs: number;
  localId: string;
  senderId: string;
}>;
type RepositoryPort = Readonly<{
  enqueuePendingMessage: (message: PendingMessage) => Promise<unknown>;
  retryFailedMessage: (
    input: Readonly<{
      clientMsgId: string;
      conversationId: string;
    }>,
  ) => Promise<unknown>;
}>;
type ChatSendController = Readonly<{
  retryFailedMessage: (
    input: Readonly<{
      clientMsgId: string;
      conversationId: string;
    }>,
  ) => Promise<unknown>;
  send: (
    input: Readonly<{
      body: string;
      clearDraft: () => void;
      onCommitted?: (localId: string) => void;
    }>,
  ) => Promise<Readonly<{ outcome: "committed" | "empty" }>>;
}>;
type ChatSendModule = {
  createChatSendController?: unknown;
  createMonotonicMessageIdentity?: unknown;
  createSystemClock?: unknown;
};
type CreateChatSendController = (
  input: Readonly<{
    clock: ClockPort;
    conversationId: string;
    messageIdentity: MessageIdentityPort;
    repository: RepositoryPort;
    senderId: string;
  }>,
) => ChatSendController;

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

function loadChatSendContract(): {
  createChatSendController: CreateChatSendController;
  createMonotonicMessageIdentity: () => MessageIdentityPort;
  createSystemClock: () => ClockPort;
} {
  let module: ChatSendModule;
  try {
    module = jest.requireActual<ChatSendModule>(
      "../../../src/features/chat/model/chat-send",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M5-RUNTIME-1 implementation missing: chat-send.ts must export the send controller and deterministic ClockPort/MessageIdentityPort factories.",
      );
    }
    throw error;
  }

  if (
    typeof module.createChatSendController !== "function" ||
    typeof module.createSystemClock !== "function" ||
    typeof module.createMonotonicMessageIdentity !== "function"
  ) {
    throw new Error(
      "M5-RUNTIME-1 chat-send contract is incomplete: expected createChatSendController(), createSystemClock(), and createMonotonicMessageIdentity().",
    );
  }

  return {
    createChatSendController:
      module.createChatSendController as CreateChatSendController,
    createMonotonicMessageIdentity:
      module.createMonotonicMessageIdentity as () => MessageIdentityPort,
    createSystemClock: module.createSystemClock as () => ClockPort,
  };
}

function createControllerDependencies(
  options?: Readonly<{
    enqueuePendingMessage?: RepositoryPort["enqueuePendingMessage"];
    retryFailedMessage?: RepositoryPort["retryFailedMessage"];
  }>,
): {
  clock: ClockPort;
  identity: MessageIdentityPort;
  repository: RepositoryPort;
} {
  return {
    clock: { nowMs: jest.fn(() => 17_000) },
    identity: {
      next: jest.fn(() => ({
        clientMsgId: "client-message-1",
        localId: "local-message-1",
      })),
    },
    repository: {
      enqueuePendingMessage:
        options?.enqueuePendingMessage ?? jest.fn(async () => undefined),
      retryFailedMessage:
        options?.retryFailedMessage ?? jest.fn(async () => undefined),
    },
  };
}

describe("M5-RUNTIME-1 deterministic local chat send controller", () => {
  test("delegates the production clock to Date.now and emits monotonic opaque identity pairs", () => {
    const { createMonotonicMessageIdentity, createSystemClock } =
      loadChatSendContract();
    const now = jest.spyOn(Date, "now").mockReturnValue(45_678);
    try {
      const clock = createSystemClock();
      const identity = createMonotonicMessageIdentity();

      expect(clock.nowMs()).toBe(45_678);
      const first = identity.next();
      const second = identity.next();
      expect(first.localId).not.toBe(second.localId);
      expect(first.clientMsgId).not.toBe(second.clientMsgId);
      expect(first.localId).not.toHaveLength(0);
      expect(first.clientMsgId).not.toHaveLength(0);
    } finally {
      now.mockRestore();
    }
  });

  test("captures exactly one clock and identity pair, preserves multiline body, enqueues once, and clears only after commit", async () => {
    const dependencies = createControllerDependencies();
    const clearDraft = jest.fn();
    const { createChatSendController } = loadChatSendContract();
    const controller = createChatSendController({
      clock: dependencies.clock,
      conversationId: "fixture-conversation",
      messageIdentity: dependencies.identity,
      repository: dependencies.repository,
      senderId: "local-user",
    });

    await expect(
      controller.send({ body: "첫 줄\n둘째 줄", clearDraft }),
    ).resolves.toEqual({ outcome: "committed" });
    expect(dependencies.clock.nowMs).toHaveBeenCalledTimes(1);
    expect(dependencies.identity.next).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.enqueuePendingMessage).toHaveBeenCalledTimes(
      1,
    );
    expect(dependencies.repository.enqueuePendingMessage).toHaveBeenCalledWith({
      body: "첫 줄\n둘째 줄",
      clientMsgId: "client-message-1",
      conversationId: "fixture-conversation",
      createdAtMs: 17_000,
      localId: "local-message-1",
      senderId: "local-user",
    });
    expect(clearDraft).toHaveBeenCalledTimes(1);
  });

  test("publishes the committed local message identity only after enqueue and draft clear", async () => {
    const lifecycle: string[] = [];
    const dependencies = createControllerDependencies({
      enqueuePendingMessage: jest.fn(async () => {
        lifecycle.push("enqueue");
      }),
    });
    const clearDraft = jest.fn(() => lifecycle.push("clear"));
    const onCommitted = jest.fn((localId: string) => {
      lifecycle.push(`committed:${localId}`);
    });
    const { createChatSendController } = loadChatSendContract();
    const controller = createChatSendController({
      clock: dependencies.clock,
      conversationId: "fixture-conversation",
      messageIdentity: dependencies.identity,
      repository: dependencies.repository,
      senderId: "local-user",
    });

    await expect(
      controller.send({
        body: "가장 최근 로컬 메시지",
        clearDraft,
        onCommitted,
      }),
    ).resolves.toEqual({ outcome: "committed" });

    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(onCommitted).toHaveBeenCalledWith("local-message-1");
    expect(lifecycle).toEqual([
      "enqueue",
      "clear",
      "committed:local-message-1",
    ]);
  });

  test("rejects empty drafts without allocating identity and retains the draft when enqueue fails", async () => {
    const enqueueFailure = jest.fn(async () => {
      throw new Error("synthetic write failure");
    });
    const dependencies = createControllerDependencies({
      enqueuePendingMessage: enqueueFailure,
    });
    const clearDraft = jest.fn();
    const onCommitted = jest.fn();
    const { createChatSendController } = loadChatSendContract();
    const controller = createChatSendController({
      clock: dependencies.clock,
      conversationId: "fixture-conversation",
      messageIdentity: dependencies.identity,
      repository: dependencies.repository,
      senderId: "local-user",
    });

    await expect(
      controller.send({ body: " \n\t ", clearDraft, onCommitted }),
    ).resolves.toEqual({
      outcome: "empty",
    });
    expect(dependencies.clock.nowMs).not.toHaveBeenCalled();
    expect(dependencies.identity.next).not.toHaveBeenCalled();
    expect(enqueueFailure).not.toHaveBeenCalled();
    expect(clearDraft).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();

    await expect(
      controller.send({
        body: "실패해도 남아야 하는 초안",
        clearDraft,
        onCommitted,
      }),
    ).rejects.toThrow("synthetic write failure");
    expect(dependencies.clock.nowMs).toHaveBeenCalledTimes(1);
    expect(dependencies.identity.next).toHaveBeenCalledTimes(1);
    expect(clearDraft).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
  });

  test("retries the existing failed command without allocating a new timestamp or identity", async () => {
    const dependencies = createControllerDependencies();
    const { createChatSendController } = loadChatSendContract();
    const controller = createChatSendController({
      clock: dependencies.clock,
      conversationId: "fixture-conversation",
      messageIdentity: dependencies.identity,
      repository: dependencies.repository,
      senderId: "local-user",
    });

    await controller.retryFailedMessage({
      clientMsgId: "fixture-client-failed-1",
      conversationId: "fixture-conversation",
    });

    expect(dependencies.repository.retryFailedMessage).toHaveBeenCalledWith({
      clientMsgId: "fixture-client-failed-1",
      conversationId: "fixture-conversation",
    });
    expect(dependencies.clock.nowMs).not.toHaveBeenCalled();
    expect(dependencies.identity.next).not.toHaveBeenCalled();
  });

  test("keeps the fixture seed type-only, stable, and free of any Enter-send binding", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const fixtureSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/model/chat-fixture.ts`,
      "utf8",
    );
    const sendSource = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/model/chat-send.ts`,
      "utf8",
    );
    const fixture = jest.requireActual<{
      FIXTURE_CONVERSATION_ID?: unknown;
      FIXTURE_CONVERSATION_SEED?: unknown;
      LOCAL_FIXTURE_NOTICE?: unknown;
    }>("../../../src/features/chat/model/chat-fixture");

    expect(fixtureSource).toMatch(
      /import\s+type\s+\{\s*FixtureConversationSeed\s*\}\s+from\s+["'][^"']*database-repository["']/,
    );
    expect(fixture.FIXTURE_CONVERSATION_ID).toBe("fixture-conversation");
    expect(fixture.LOCAL_FIXTURE_NOTICE).toBe(
      "로컬 개발용 fixture 데이터입니다. production server에 연결되어 있지 않습니다.",
    );
    expect(fixture.FIXTURE_CONVERSATION_SEED).toEqual(
      expect.objectContaining({
        conversation: expect.objectContaining({
          id: fixture.FIXTURE_CONVERSATION_ID,
        }),
      }),
    );
    expect(fixtureSource).not.toMatch(
      /Date\.now|Math\.random|createSystemClock|createMonotonicMessageIdentity/,
    );
    expect(sendSource).not.toMatch(/onKeyPress|onSubmitEditing|\bEnter\b/);
  });
});
