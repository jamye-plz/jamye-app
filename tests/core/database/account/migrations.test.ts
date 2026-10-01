type ChildProcessModule = Readonly<{
  execFileSync: (
    file: string,
    args: readonly string[],
    options: Readonly<{ cwd: string; encoding: "utf8" }>,
  ) => string;
}>;

describe("account DB v7 migration (CHAT-AC6, plan api_contracts.E2_media_expired_failure)", () => {
  test("widens connected_chat_outbox_commands.error_code's CHECK to accept media_expired, preserves every existing outbox row (including a legacy error_code) across the rebuild, rolls back cleanly, a fresh install reaches v7 directly, and a device v6 database with cascade-orphaned rows still upgrades", () => {
    const { execFileSync } =
      jest.requireActual<ChildProcessModule>("node:child_process");

    const output = execFileSync(
      "bun",
      ["tests/core/database/account/media-expired-error-code-migration.bun.ts"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output.trim()).toBe("media-expired-error-code-migration: PASS");
  });
});
