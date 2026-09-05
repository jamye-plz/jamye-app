import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Keyboard } from "react-native";

import { AppThemeProvider } from "../../../src/core/theme/theme-provider";

type FileSystemModule = Readonly<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>;

type ChatSendOutcome = Readonly<{ outcome: "committed" | "empty" }>;
type ChatSendController = Readonly<{
  send: (
    input: Readonly<{
      body: string;
      clearDraft: () => void;
      onCommitted?: (localId: string) => void;
    }>,
  ) => Promise<ChatSendOutcome>;
}>;

type ChatComposerModule = { ChatComposer?: unknown };
type ChatComposer = (
  props: Readonly<{
    controller: ChatSendController;
    onMessageCommitted?: (localId: string) => void;
  }>,
) => React.JSX.Element;

function createDeferred<Value>() {
  let reject: (error: Error) => void = () => undefined;
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

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

function loadChatComposer(): ChatComposer {
  let module: ChatComposerModule;
  try {
    module = jest.requireActual<ChatComposerModule>(
      "../../../src/features/chat/ui/chat-composer",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M5-UI-1 implementation missing: chat-composer.tsx must export ChatComposer.",
      );
    }
    throw error;
  }

  if (typeof module.ChatComposer !== "function") {
    throw new Error(
      "M5-UI-1 chat-composer contract is incomplete: expected ChatComposer({ controller }).",
    );
  }
  return module.ChatComposer as ChatComposer;
}

describe("M5-UI-1 explicit-send Korean IME composer", () => {
  test("uses one multiline named input and one disabled empty explicit-send control", async () => {
    const ChatComposer = loadChatComposer();
    const controller: ChatSendController = {
      send: jest.fn(async () => ({ outcome: "empty" as const })),
    };
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={controller} />
      </AppThemeProvider>,
    );

    const input = screen.getByLabelText("메시지 입력");
    const send = screen.getByRole("button", { name: "메시지 보내기" });

    expect(input.props.multiline).toBe(true);
    expect(input.props.placeholder).toBe("메시지 입력...");
    expect(send.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  test("retains Korean multiline IME draft until only the named button commits it", async () => {
    const ChatComposer = loadChatComposer();
    const send = jest.fn<
      Promise<ChatSendOutcome>,
      [Readonly<{ body: string; clearDraft: () => void }>]
    >(async () => ({ outcome: "committed" }));
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} />
      </AppThemeProvider>,
    );
    const input = screen.getByLabelText("메시지 입력");

    await fireEvent.changeText(input, "안녕하세요\n둘째 줄");
    await fireEvent(input, "keyPress", { nativeEvent: { key: "Enter" } });

    expect(send).not.toHaveBeenCalled();
    expect(input.props.value).toBe("안녕하세요\n둘째 줄");

    await fireEvent.press(
      screen.getByRole("button", { name: "메시지 보내기" }),
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ body: "안녕하세요\n둘째 줄" }),
    );
  });

  test("forwards the committed identity while preserving keyboard focus after commit", async () => {
    const ChatComposer = loadChatComposer();
    const lifecycle: string[] = [];
    const onMessageCommitted = jest.fn(() => {
      lifecycle.push("publish");
    });
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {
      lifecycle.push("dismiss");
    });
    const send = jest.fn<
      Promise<ChatSendOutcome>,
      [
        Readonly<{
          body: string;
          clearDraft: () => void;
          onCommitted?: (localId: string) => void;
        }>,
      ]
    >(async ({ clearDraft, onCommitted }) => {
      clearDraft();
      onCommitted?.("local-message-1");
      lifecycle.push("resolve");
      return { outcome: "committed" };
    });

    try {
      const screen = await render(
        <AppThemeProvider>
          <ChatComposer
            controller={{ send }}
            onMessageCommitted={onMessageCommitted}
          />
        </AppThemeProvider>,
      );

      const input = screen.getByLabelText("메시지 입력");
      await fireEvent(input, "focus");
      await fireEvent.changeText(input, "커밋 뒤 키보드 유지");
      await fireEvent.press(
        screen.getByRole("button", { name: "메시지 보내기" }),
      );

      expect(send.mock.calls[0]?.[0].onCommitted).toBe(onMessageCommitted);
      expect(onMessageCommitted).toHaveBeenCalledWith("local-message-1");
      expect(screen.getByLabelText("메시지 입력").props.value).toBe("");
      expect(dismiss).not.toHaveBeenCalled();
      expect(lifecycle).toEqual(["publish", "resolve"]);
    } finally {
      dismiss.mockRestore();
    }
  });

  test("keeps the keyboard and draft when the controller reports no commit", async () => {
    const ChatComposer = loadChatComposer();
    const dismiss = jest
      .spyOn(Keyboard, "dismiss")
      .mockImplementation(() => undefined);
    const send = jest.fn(async () => ({ outcome: "empty" as const }));

    try {
      const screen = await render(
        <AppThemeProvider>
          <ChatComposer controller={{ send }} />
        </AppThemeProvider>,
      );
      const input = screen.getByLabelText("메시지 입력");

      await fireEvent(input, "focus");
      await fireEvent.changeText(input, "아직 커밋되지 않은 초안");
      await fireEvent.press(
        screen.getByRole("button", { name: "메시지 보내기" }),
      );

      expect(input.props.value).toBe("아직 커밋되지 않은 초안");
      expect(dismiss).not.toHaveBeenCalled();
    } finally {
      dismiss.mockRestore();
    }
  });

  test("disables the explicit button in flight and prevents duplicate sends", async () => {
    const ChatComposer = loadChatComposer();
    const commit = createDeferred<ChatSendOutcome>();
    const send = jest.fn<
      Promise<ChatSendOutcome>,
      [Readonly<{ body: string; clearDraft: () => void }>]
    >(() => commit.promise);
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} />
      </AppThemeProvider>,
    );
    const input = screen.getByLabelText("메시지 입력");

    await fireEvent.changeText(input, "한 번만 전송");
    const button = screen.getByRole("button", { name: "메시지 보내기" });
    await fireEvent.press(button);
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    await fireEvent.press(button);
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => {
      commit.resolve({ outcome: "committed" });
      await commit.promise;
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("retains the draft when the explicit send controller rejects", async () => {
    const ChatComposer = loadChatComposer();
    const failure = createDeferred<ChatSendOutcome>();
    const dismiss = jest
      .spyOn(Keyboard, "dismiss")
      .mockImplementation(() => undefined);
    const send = jest.fn<
      Promise<ChatSendOutcome>,
      [Readonly<{ body: string; clearDraft: () => void }>]
    >(() => failure.promise);
    try {
      const screen = await render(
        <AppThemeProvider>
          <ChatComposer controller={{ send }} />
        </AppThemeProvider>,
      );
      const input = screen.getByLabelText("메시지 입력");

      await fireEvent(input, "focus");
      await fireEvent.changeText(input, "실패 뒤에도 남는 초안");
      await fireEvent.press(
        screen.getByRole("button", { name: "메시지 보내기" }),
      );
      await act(async () => {
        failure.reject(new Error("write failed"));
        await failure.promise.catch(() => undefined);
      });

      expect(input.props.value).toBe("실패 뒤에도 남는 초안");
      expect(send).toHaveBeenCalledTimes(1);
      expect(dismiss).not.toHaveBeenCalled();
    } finally {
      dismiss.mockRestore();
    }
  });

  test("keeps Enter, submit-editing, and composition handling free of send bindings and consumes the approved layout tokens", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-composer.tsx`,
      "utf8",
    );

    expect(source).not.toMatch(
      /onKeyPress|onSubmitEditing|onEndEditing|onComposition(?:End|Start|Update)/,
    );
    expect(source).toMatch(
      /appChatComposer|composerMinHeight|composerMaxHeight/,
    );
    expect(source).toMatch(/44/);
    expect(source).not.toMatch(/microphone|media|recording|skeleton/i);
  });
});
