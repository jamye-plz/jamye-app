import { pendingInviteStore } from "@/features/groups/model/pending-invite-store";

describe("pendingInviteStore (E6/A3: memory-only invite code holder)", () => {
  afterEach(() => pendingInviteStore.clear());

  test("peek returns null until set, and does not consume", () => {
    expect(pendingInviteStore.peek()).toBeNull();
    pendingInviteStore.set("a".repeat(20));
    expect(pendingInviteStore.peek()).toBe("a".repeat(20));
    expect(pendingInviteStore.peek()).toBe("a".repeat(20));
  });

  test("consume returns the code once and then empties the store", () => {
    pendingInviteStore.set("b".repeat(20));
    expect(pendingInviteStore.consume()).toBe("b".repeat(20));
    expect(pendingInviteStore.consume()).toBeNull();
    expect(pendingInviteStore.peek()).toBeNull();
  });

  test("a later set overwrites an earlier unconsumed code", () => {
    pendingInviteStore.set("c".repeat(20));
    pendingInviteStore.set("d".repeat(20));
    expect(pendingInviteStore.consume()).toBe("d".repeat(20));
  });

  test("clear empties the store regardless of prior state (logout)", () => {
    pendingInviteStore.set("e".repeat(20));
    pendingInviteStore.clear();
    expect(pendingInviteStore.peek()).toBeNull();
    expect(pendingInviteStore.consume()).toBeNull();
  });
});
