type Message = Readonly<{
  body: string;
  createdAtMs: number;
  localId: string;
}>;

type ChatMessageWindowModule = {
  mergeMessageWindow?: unknown;
};

type MergeMessageWindow = (
  current: readonly Message[],
  incoming: readonly Message[],
) => Message[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error.code === "MODULE_NOT_FOUND" ||
      (typeof error.message === "string" &&
        error.message.includes("Cannot find module")))
  );
}

function loadMergeMessageWindow(): MergeMessageWindow {
  let module: ChatMessageWindowModule;
  try {
    module = jest.requireActual<ChatMessageWindowModule>(
      "../../../src/features/chat/model/chat-message-window",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M5-UI-1 implementation missing: chat-message-window.ts must export mergeMessageWindow(current, incoming).",
      );
    }
    throw error;
  }

  if (typeof module.mergeMessageWindow !== "function") {
    throw new Error(
      "M5-UI-1 chat-message-window contract is incomplete: expected mergeMessageWindow(current, incoming).",
    );
  }

  return module.mergeMessageWindow as MergeMessageWindow;
}

function message(
  localId: string,
  createdAtMs: number,
  body = localId,
): Message {
  return { body, createdAtMs, localId };
}

describe("M5-UI-1 deterministic message-window merge", () => {
  test("deduplicates by stable localId while retaining the refreshed row", () => {
    const mergeMessageWindow = loadMergeMessageWindow();

    expect(
      mergeMessageWindow(
        [message("local-1", 10, "before"), message("local-2", 20)],
        [message("local-1", 10, "after"), message("local-3", 30)],
      ),
    ).toEqual([
      message("local-1", 10, "after"),
      message("local-2", 20),
      message("local-3", 30),
    ]);
  });

  test("uses localId as the deterministic timestamp-tie order", () => {
    const mergeMessageWindow = loadMergeMessageWindow();

    expect(
      mergeMessageWindow(
        [message("local-b", 100)],
        [message("local-c", 100), message("local-a", 100)],
      ).map((item) => item.localId),
    ).toEqual(["local-a", "local-b", "local-c"]);
  });

  test("prepends older rows without replacing the visible anchor key", () => {
    const mergeMessageWindow = loadMergeMessageWindow();
    const anchor = message("visible-anchor", 200);

    const merged = mergeMessageWindow(
      [anchor, message("newer", 300)],
      [message("older", 100), anchor],
    );

    expect(merged.map((item) => item.localId)).toEqual([
      "older",
      "visible-anchor",
      "newer",
    ]);
    expect(merged.find((item) => item.localId === anchor.localId)).toBe(anchor);
  });

  test("subscription refresh retains already-prepended older rows", () => {
    const mergeMessageWindow = loadMergeMessageWindow();

    expect(
      mergeMessageWindow(
        [message("older", 100), message("anchor", 200), message("latest", 300)],
        [message("latest", 300, "refreshed")],
      ),
    ).toEqual([
      message("older", 100),
      message("anchor", 200),
      message("latest", 300, "refreshed"),
    ]);
  });
});
