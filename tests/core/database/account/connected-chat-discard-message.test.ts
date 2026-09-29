type ChildProcessModule = Readonly<{
  execFileSync: (
    file: string,
    args: readonly string[],
    options: Readonly<{ cwd: string; encoding: "utf8" }>,
  ) => string;
}>;

describe("M15/task-14 discardFailedMessage cleanup (AC5)", () => {
  test("removes the message row and its outbox command (with the upload draft reference) together via FK cascade; is a safe no-op when missing, no longer failed, or in a different chatroom", () => {
    const { execFileSync } =
      jest.requireActual<ChildProcessModule>("node:child_process");

    const output = execFileSync(
      "bun",
      ["tests/core/database/account/connected-chat-discard-message.bun.ts"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output.trim()).toBe("connected-chat-discard-message: PASS");
  });
});
