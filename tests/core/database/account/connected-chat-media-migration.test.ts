type ChildProcessModule = Readonly<{
  execFileSync: (
    file: string,
    args: readonly string[],
    options: Readonly<{ cwd: string; encoding: "utf8" }>,
  ) => string;
}>;

describe("M11 connected chat media migration", () => {
  test("preserves v4 outbox recovery state and rolls back a partial v5 upgrade", () => {
    const { execFileSync } =
      jest.requireActual<ChildProcessModule>("node:child_process");

    const output = execFileSync(
      "bun",
      ["tests/core/database/account/connected-chat-media-migration.bun.ts"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output.trim()).toBe("connected-chat-media-migration: PASS");
  });
});
