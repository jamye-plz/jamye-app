type ChildProcessModule = Readonly<{
  execFileSync: (
    file: string,
    args: readonly string[],
    options: Readonly<{ cwd: string; encoding: "utf8" }>,
  ) => string;
}>;

describe("M15/task-14 account v6 migration (AC1/E17)", () => {
  test("adds a monotonic message deletion tombstone, widens connected_chat_applied_events.event_kind, preserves connected_chat_reconciliation_scopes markers across the rebuild, rolls back cleanly, and a fresh install reaches v6 directly", () => {
    const { execFileSync } =
      jest.requireActual<ChildProcessModule>("node:child_process");

    const output = execFileSync(
      "bun",
      ["tests/core/database/account/connected-chat-deletions-migration.bun.ts"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output.trim()).toBe("connected-chat-deletions-migration: PASS");
  });
});
