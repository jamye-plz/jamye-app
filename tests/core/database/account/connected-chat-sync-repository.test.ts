type ChildProcessModule = Readonly<{
  execFileSync: (
    file: string,
    args: readonly string[],
    options: Readonly<{ cwd: string; encoding: "utf8" }>,
  ) => string;
}>;

describe("M9 account-scoped outbox and ordered event persistence", () => {
  test("passes additive migration, lease CAS, event checkpoint, dedupe, and dirty-marker scenarios", () => {
    const { execFileSync } =
      jest.requireActual<ChildProcessModule>("node:child_process");

    const output = execFileSync(
      "bun",
      ["tests/core/database/account/connected-chat-sync-repository.bun.ts"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output.trim()).toBe("m9-account-sync-sqlite: PASS");
  });
});
