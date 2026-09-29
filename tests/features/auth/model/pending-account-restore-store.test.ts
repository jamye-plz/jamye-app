import { pendingAccountRestoreStore } from "@/features/auth/model/pending-account-restore-store";

describe("pendingAccountRestoreStore (G2/E13: memory-only account-restore flag)", () => {
  afterEach(() => pendingAccountRestoreStore.clear());

  test("peek returns false until set, and does not consume", () => {
    expect(pendingAccountRestoreStore.peek()).toBe(false);
    pendingAccountRestoreStore.set();
    expect(pendingAccountRestoreStore.peek()).toBe(true);
    expect(pendingAccountRestoreStore.peek()).toBe(true);
  });

  test("consume returns true once and then empties the store", () => {
    pendingAccountRestoreStore.set();
    expect(pendingAccountRestoreStore.consume()).toBe(true);
    expect(pendingAccountRestoreStore.consume()).toBe(false);
    expect(pendingAccountRestoreStore.peek()).toBe(false);
  });

  test("consume returns false when nothing was ever set", () => {
    expect(pendingAccountRestoreStore.consume()).toBe(false);
  });

  test("clear empties the store regardless of prior state (logout)", () => {
    pendingAccountRestoreStore.set();
    pendingAccountRestoreStore.clear();
    expect(pendingAccountRestoreStore.peek()).toBe(false);
    expect(pendingAccountRestoreStore.consume()).toBe(false);
  });
});
