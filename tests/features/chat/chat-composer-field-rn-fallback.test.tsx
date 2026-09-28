import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "../../../src/core/theme/theme-provider";
import type { MediaAttachmentController } from "../../../src/features/media/ui/media-attachment-types";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
// W2: force the RN `TextInput` fallback path (`COMPOSER_TEXT_FIELD_IMPL ===
// "rn"`, `chat-composer-field-impl.ts`) to prove E11 (explicit send only,
// Return = newline, clear + keep focus/mounted after send) also holds on the
// fallback the on-device switch falls back to -- not just the native default
// covered by `chat-composer.test.tsx`. `chat-composer-field.ios.tsx` branches
// on this constant before rendering any `@expo/ui/swift-ui` component, so no
// swift-ui mock is needed here (that module is imported but never mounted).
jest.mock("@/features/chat/ui/chat-composer-field-impl", () => ({
  COMPOSER_TEXT_FIELD_IMPL: "rn",
}));

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

type ChatComposerModule = { ChatComposer?: unknown };
type ChatComposer = (props: {
  controller: { send: (input: never) => Promise<{ outcome: string }> };
  attachmentController?: MediaAttachmentController | null;
}) => React.JSX.Element;

function loadChatComposer(): ChatComposer {
  const module = jest.requireActual<ChatComposerModule>(
    "../../../src/features/chat/ui/chat-composer",
  );
  return module.ChatComposer as ChatComposer;
}

describe('ChatComposer W2 rn fallback (COMPOSER_TEXT_FIELD_IMPL = "rn")', () => {
  test("E11: Return only inserts a newline, only the explicit 보내기 tap sends, and a successful send clears the field while keeping it mounted", async () => {
    const ChatComposer = loadChatComposer();
    const send = jest.fn(
      async (input: { body: string; clearDraft: () => void }) => {
        input.clearDraft();
        return { outcome: "committed" as const };
      },
    );
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} />
      </AppThemeProvider>,
    );
    const input = screen.getByLabelText("메시지 입력");
    await fireEvent.changeText(input, "첫 줄\n둘째 줄");
    await fireEvent(input, "keyPress", { nativeEvent: { key: "Enter" } });
    expect(send).not.toHaveBeenCalled();
    expect(input.props.value).toBe("첫 줄\n둘째 줄");

    await fireEvent.press(
      screen.getByRole("button", { name: "메시지 보내기" }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ body: "첫 줄\n둘째 줄" }),
    );
    // E11: clears after a successful send and the same input stays mounted
    // (queryable by the same label) -- i.e. focus/keyboard is not torn down.
    expect(screen.getByLabelText("메시지 입력").props.value).toBe("");
  });

  test("W1: mic<->send toggles exactly as on the native path", async () => {
    const ChatComposer = loadChatComposer();
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const attachment = fakeAttachmentController();
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer attachmentController={attachment} controller={{ send }} />
      </AppThemeProvider>,
    );
    expect(screen.getByLabelText("음성 메시지 녹음")).toBeTruthy();
    expect(screen.queryByLabelText("메시지 보내기")).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("메시지 입력"), "글");
    expect(screen.getByLabelText("메시지 보내기")).toBeTruthy();
    expect(screen.queryByLabelText("음성 메시지 녹음")).toBeNull();
  });
});
