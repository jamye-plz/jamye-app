import type { DatabaseRepository } from "@/core/database/repositories/database-repository";

export type ClockPort = Readonly<{
  nowMs: () => number;
}>;

export type MessageIdentityPort = Readonly<{
  next: () => Readonly<{
    clientMsgId: string;
    localId: string;
  }>;
}>;

type ChatSendRepository = Pick<
  DatabaseRepository,
  "enqueuePendingMessage" | "retryFailedMessage"
>;

export type ChatSendController = Readonly<{
  retryFailedMessage: (
    input: Readonly<{
      clientMsgId: string;
      conversationId: string;
    }>,
  ) => ReturnType<ChatSendRepository["retryFailedMessage"]>;
  send: (
    input: Readonly<{
      body: string;
      clearDraft: () => void;
      onCommitted?: (localId: string) => void;
    }>,
  ) => Promise<Readonly<{ outcome: "committed" | "empty" }>>;
}>;

export function createSystemClock(): ClockPort {
  return { nowMs: () => Date.now() };
}

export function createMonotonicMessageIdentity(): MessageIdentityPort {
  const processEntropy = Math.random().toString(36).slice(2);
  let counter = 0;

  return {
    next: () => {
      counter += 1;
      const suffix = `${Date.now().toString(36)}:${processEntropy}:${counter}`;
      return {
        clientMsgId: `client:${suffix}`,
        localId: `local:${suffix}`,
      };
    },
  };
}

export function createChatSendController(
  input: Readonly<{
    clock: ClockPort;
    conversationId: string;
    messageIdentity: MessageIdentityPort;
    repository: ChatSendRepository;
    senderId: string;
  }>,
): ChatSendController {
  return {
    retryFailedMessage: (retryInput) =>
      input.repository.retryFailedMessage(retryInput),
    async send({ body, clearDraft, onCommitted }) {
      if (body.trim().length === 0) return { outcome: "empty" };

      const createdAtMs = input.clock.nowMs();
      const { clientMsgId, localId } = input.messageIdentity.next();
      await input.repository.enqueuePendingMessage({
        body,
        clientMsgId,
        conversationId: input.conversationId,
        createdAtMs,
        localId,
        senderId: input.senderId,
      });
      clearDraft();
      onCommitted?.(localId);
      return { outcome: "committed" };
    },
  };
}
