import type { TopicDeletedEvent } from "@/core/contracts/server";
import {
  __resetTopicDeletedHandlersForTests,
  dispatchTopicDeleted,
  registerTopicDeletedHandler,
} from "@/features/sync/realtime/topic-deleted-dispatch";

function event(overrides: Partial<TopicDeletedEvent> = {}): TopicDeletedEvent {
  return {
    conversation_id: "10000000-0000-4000-8000-000000000001",
    cursor: "1",
    data: {
      announcement_message_id: null,
      deleted_at: "2026-09-10T00:00:00Z",
      deleted_by: "20000000-0000-4000-8000-000000000002",
      group_id: "30000000-0000-4000-8000-000000000003",
      topic_chatroom_id: "10000000-0000-4000-8000-000000000001",
      topic_id: "40000000-0000-4000-8000-000000000004",
    },
    event_id: "50000000-0000-4000-8000-000000000005",
    occurred_at: "2026-09-10T00:00:00Z",
    type: "topic.deleted",
    version: 1,
    ...overrides,
  } as TopicDeletedEvent;
}

describe("topic-deleted-dispatch (AC7, plan api_contracts.app_sync_apply.interface)", () => {
  afterEach(() => {
    __resetTopicDeletedHandlersForTests();
  });

  test("dispatching with no registered handler is a silent no-op", () => {
    expect(() => dispatchTopicDeleted(event())).not.toThrow();
  });

  test("a registered handler receives the exact dispatched event", () => {
    const handler = jest.fn();
    registerTopicDeletedHandler(handler);
    const payload = event();

    dispatchTopicDeleted(payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  test("multiple listeners each receive the same dispatch (task-app-topics is not the only possible consumer)", () => {
    const first = jest.fn();
    const second = jest.fn();
    registerTopicDeletedHandler(first);
    registerTopicDeletedHandler(second);
    const payload = event();

    dispatchTopicDeleted(payload);

    expect(first).toHaveBeenCalledWith(payload);
    expect(second).toHaveBeenCalledWith(payload);
  });

  test("the returned unsubscribe function stops further dispatches to that handler only", () => {
    const staying = jest.fn();
    const leaving = jest.fn();
    registerTopicDeletedHandler(staying);
    const unregister = registerTopicDeletedHandler(leaving);

    unregister();
    dispatchTopicDeleted(event());

    expect(staying).toHaveBeenCalledTimes(1);
    expect(leaving).not.toHaveBeenCalled();
  });

  test("unregistering twice is safe (no throw, no double-remove side effect)", () => {
    const handler = jest.fn();
    const unregister = registerTopicDeletedHandler(handler);
    unregister();

    expect(() => unregister()).not.toThrow();
    dispatchTopicDeleted(event());
    expect(handler).not.toHaveBeenCalled();
  });

  test("registering the exact same handler function twice only calls it once per dispatch (Set semantics)", () => {
    const handler = jest.fn();
    registerTopicDeletedHandler(handler);
    registerTopicDeletedHandler(handler);

    dispatchTopicDeleted(event());

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("a handler registered after a dispatch already fired simply misses it (no queueing)", () => {
    dispatchTopicDeleted(event());
    const lateHandler = jest.fn();

    registerTopicDeletedHandler(lateHandler);

    expect(lateHandler).not.toHaveBeenCalled();
  });

  test("__resetTopicDeletedHandlersForTests clears every registered listener", () => {
    const handler = jest.fn();
    registerTopicDeletedHandler(handler);

    __resetTopicDeletedHandlersForTests();
    dispatchTopicDeleted(event());

    expect(handler).not.toHaveBeenCalled();
  });
});
