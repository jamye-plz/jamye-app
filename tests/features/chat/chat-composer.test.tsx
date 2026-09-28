import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Keyboard } from "react-native";

import { AppThemeProvider } from "../../../src/core/theme/theme-provider";
import type { MediaAttachmentController } from "../../../src/features/media/ui/media-attachment-types";
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
// W2: `chat-composer-field.ios.tsx` renders a native SwiftUI `TextField` by
// default (`COMPOSER_TEXT_FIELD_IMPL === "native"`). jest-expo renders
// `@expo/ui`'s components as an opaque host node (see
// `tests/__mocks__/@expo/ui.tsx`'s docstring), so this mock stands in an RN
// `TextInput` that mirrors the same public contract (`axis` -> `multiline`,
// `modifiers=[accessibilityLabel(...)]` -> `accessibilityLabel`,
// `onTextChange` -> `onChangeText`, `onFocusChange` -> `onFocus`/`onBlur`,
// `ref.clear()` -> resets its own text) so every existing assertion here
// (`.props.value`, `.props.multiline`, `.props.placeholder`,
// `fireEvent.changeText`) keeps working unchanged against the native path.
jest.mock("@expo/ui/swift-ui", () => {
  // Spread the real module (not just `{ TextField }`) so unrelated
  // `@expo/ui/swift-ui` consumers in the same tree (e.g. `SystemFeedbackHost`
  // -> `system-feedback.ios.tsx`'s `Alert`) keep their real components.
  const actual =
    jest.requireActual<Record<string, unknown>>("@expo/ui/swift-ui");
  const React = jest.requireActual<typeof import("react")>("react");
  const { TextInput } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function extractLabel(modifiers?: readonly unknown[]): string | undefined {
    const found = modifiers?.find(
      (modifier): modifier is { $type: string; value: string } =>
        typeof modifier === "object" &&
        modifier !== null &&
        (modifier as { $type?: unknown }).$type === "accessibilityLabel",
    );
    return found?.value;
  }
  const TextField = React.forwardRef(function MockSwiftUITextField(
    props: {
      axis?: string;
      modifiers?: readonly unknown[];
      onFocusChange?: (focused: boolean) => void;
      onTextChange?: (text: string) => void;
      placeholder?: string;
    },
    ref: React.Ref<{ clear: () => void }>,
  ) {
    const [text, setText] = React.useState("");
    React.useImperativeHandle(ref, () => ({
      clear: () => setText(""),
      focus: () => undefined,
    }));
    return (
      <TextInput
        accessibilityLabel={extractLabel(props.modifiers)}
        multiline={props.axis === "vertical"}
        onBlur={() => props.onFocusChange?.(false)}
        onChangeText={(next: string) => {
          setText(next);
          props.onTextChange?.(next);
        }}
        onFocus={() => props.onFocusChange?.(true)}
        placeholder={props.placeholder}
        value={text}
      />
    );
  });
  return { ...actual, TextField };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  accessibilityLabel: (value: string) => ({
    $type: "accessibilityLabel",
    value,
  }),
  lineLimit: (range: unknown) => ({ $type: "lineLimit", range }),
}));

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
    blocked?: boolean;
    attachmentController?: MediaAttachmentController | null;
    onHeightChange?: (height: number) => void;
  }>,
) => React.JSX.Element;

function fakeAttachmentController(): MediaAttachmentController {
  return {
    items: [],
    addImageOrVideo: jest.fn(),
    addAudio: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn(),
    remove: jest.fn(),
  };
}

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
  test("does not erase text typed after the committed draft, and honors the connected send gate", async () => {
    const ChatComposer = loadChatComposer();
    const pending = createDeferred<ChatSendOutcome>();
    let clearDraft!: () => void;
    const send = jest.fn((input: { body: string; clearDraft: () => void }) => {
      clearDraft = input.clearDraft;
      return pending.promise;
    });
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} />
      </AppThemeProvider>,
    );
    await fireEvent.changeText(
      screen.getByLabelText("메시지 입력"),
      "첫 메시지",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "메시지 보내기" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("메시지 입력"),
      "다음 메시지",
    );
    await act(() => {
      clearDraft();
      pending.resolve({ outcome: "committed" });
    });
    expect(screen.getByLabelText("메시지 입력").props.value).toBe(
      "다음 메시지",
    );
    await screen.rerender(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} blocked />
      </AppThemeProvider>,
    );
    expect(
      screen.getByRole("button", { name: "메시지 보내기" }),
    ).toBeDisabled();
    await fireEvent.press(
      screen.getByRole("button", { name: "메시지 보내기" }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
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
    expect(input.props.placeholder).toBe("메시지");
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
    // M14 round 2 (W1/W2) splits the composer into `chat-composer.ios.tsx`
    // (rendered here, Liquid Glass) and `chat-composer.android.tsx` (M3);
    // `chat-composer.tsx` is now only the generic tsc bare-import fallback
    // (never rendered under jest, which always resolves iOS -- see its
    // docstring), so the source-of-truth invariant scan targets the file
    // that actually renders.
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/features/chat/ui/chat-composer.ios.tsx`,
      "utf8",
    );

    expect(source).not.toMatch(
      /onKeyPress|onSubmitEditing|onEndEditing|onComposition(?:End|Start|Update)/,
    );
    expect(source).toMatch(
      /appChatComposer|composerMinHeight|composerMaxHeight/,
    );
    expect(source).toMatch(/44/);
    // M11 added attachment UI; M14 round 2 (W1/V1) adds the mic<->send swap
    // and the record/preview bars, so "microphone"/"recording" are now
    // expected here. "skeleton" remains out of scope.
    expect(source).not.toMatch(/skeleton/i);
  });

  test("reports its measured height (draft row + record bar included) through onHeightChange, deduping repeat layouts", async () => {
    const ChatComposer = loadChatComposer();
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const onHeightChange = jest.fn();
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} onHeightChange={onHeightChange} />
      </AppThemeProvider>,
    );
    const root = screen.getByTestId("chat-composer-root");

    await act(() => {
      fireEvent(root, "layout", {
        nativeEvent: { layout: { height: 96, width: 320, x: 0, y: 0 } },
      });
    });
    expect(onHeightChange).toHaveBeenCalledTimes(1);
    expect(onHeightChange).toHaveBeenLastCalledWith(96);

    await act(() => {
      fireEvent(root, "layout", {
        nativeEvent: { layout: { height: 96, width: 320, x: 0, y: 0 } },
      });
    });
    expect(onHeightChange).toHaveBeenCalledTimes(1);

    await act(() => {
      fireEvent(root, "layout", {
        nativeEvent: { layout: { height: 148, width: 320, x: 0, y: 0 } },
      });
    });
    expect(onHeightChange).toHaveBeenCalledTimes(2);
    expect(onHeightChange).toHaveBeenLastCalledWith(148);
  });

  test("W1: shows mic (not a disabled send button) once a controller is present, empty input, and no attachments", async () => {
    const ChatComposer = loadChatComposer();
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const attachment = fakeAttachmentController();

    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} attachmentController={attachment} />
      </AppThemeProvider>,
    );

    expect(screen.getByLabelText("음성 메시지 녹음")).toBeTruthy();
    expect(screen.queryByLabelText("메시지 보내기")).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("메시지 입력"), "글");
    expect(screen.getByLabelText("메시지 보내기")).toBeTruthy();
    expect(screen.queryByLabelText("음성 메시지 녹음")).toBeNull();
  });

  test("W1/E3: tapping mic starts recording and replaces the whole input row with the record bar", async () => {
    const ChatComposer = loadChatComposer();
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const attachment = fakeAttachmentController();

    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} attachmentController={attachment} />
      </AppThemeProvider>,
    );

    await act(async () => {
      await fireEvent.press(screen.getByLabelText("음성 메시지 녹음"));
    });

    expect(screen.getByTestId("voice-recording-bar")).toBeTruthy();
    expect(screen.queryByLabelText("메시지 입력")).toBeNull();
    expect(screen.queryByLabelText("첨부 추가")).toBeNull();
    expect(screen.getByLabelText("정지")).toBeTruthy();
    expect(screen.getByLabelText("삭제")).toBeTruthy();
  });
});
