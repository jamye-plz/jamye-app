describe("M10 additive topic cache and reconciliation", () => {
  test("preserves chat/outbox/checkpoints, isolates accounts and conditionally clears dirty markers", () => {
    const { execFileSync } = jest.requireActual<{
      execFileSync: (
        file: string,
        args: readonly string[],
        options: { cwd: string; encoding: "utf8" },
      ) => string;
    }>("node:child_process");
    expect(
      execFileSync(
        "bun",
        ["tests/core/database/account/topics-repository.bun.ts"],
        { cwd: process.cwd(), encoding: "utf8" },
      ).trim(),
    ).toBe("m10-topics-sqlite: PASS");
  });
});
