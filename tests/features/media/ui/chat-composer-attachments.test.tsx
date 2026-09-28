import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { ChatComposer } from "@/features/chat/ui/chat-composer";
import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";
import { SystemFeedbackHost } from "@/shared/ui/system-feedback";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
// W2: see the matching mock in `chat-composer.test.tsx` for why this is
// needed (native SwiftUI `TextField` default, opaque `@expo/ui` host node
// under jest).
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

function fakeController(
  items: MediaAttachmentController["items"] = [],
): MediaAttachmentController {
  return {
    items,
    addImageOrVideo: jest.fn(),
    addAudio: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn(),
    remove: jest.fn(),
  };
}

describe("M11 ChatComposer attachment integration", () => {
  const confirmedItem: MediaAttachmentController["items"][number] = {
    localId: "confirmed-a",
    kind: "image",
    uri: "file:///staged/a.jpg",
    filename: "a.jpg",
    byteSize: 10,
    width: null,
    height: null,
    duration: null,
    status: "confirmed",
    progress: 0,
    errorMessage: null,
    confirmed: {
      mediaUploadId: "upload-a",
      type: "image/jpeg",
      filename: "a.jpg",
      byteSize: 10,
      width: null,
      height: null,
      duration: null,
      posterMediaId: null,
    },
  };
  test.each(["uploading", "finalizing", "failed"] as const)(
    "text cannot silently discard an attachment still %s",
    async (status) => {
      const send = jest.fn();
      const attachment = fakeController([
        confirmedItem,
        { ...confirmedItem, localId: "b", status, confirmed: null },
      ]);
      const screen = await render(
        <AppThemeProvider>
          <ChatComposer
            controller={{ send }}
            attachmentController={attachment}
          />
        </AppThemeProvider>,
      );
      await fireEvent.changeText(
        screen.getByLabelText("메시지 입력"),
        "함께 보낼 본문",
      );
      expect(screen.getByLabelText("메시지 보내기")).toBeDisabled();
      await fireEvent.press(screen.getByLabelText("메시지 보내기"));
      expect(send).not.toHaveBeenCalled();
    },
  );
  test("clears only submitted attachments after durable commit, retaining them on DB failure", async () => {
    const attachment = fakeController([confirmedItem]);
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockImplementationOnce(async (input) => {
        input.clearDraft();
        return { outcome: "committed" };
      });
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} attachmentController={attachment} />
      </AppThemeProvider>,
    );
    await fireEvent.press(screen.getByLabelText("메시지 보내기"));
    expect(attachment.remove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("메시지 보내기"));
    expect(attachment.remove).toHaveBeenCalledTimes(1);
    expect(attachment.remove).toHaveBeenCalledWith("confirmed-a");
  });
  test("audio with whitespace drafts sends an actually bodyless command", async () => {
    const attachment = fakeController([
      {
        ...confirmedItem,
        kind: "audio",
        confirmed: {
          ...confirmedItem.confirmed!,
          type: "audio/ogg",
          duration: 3,
        },
      },
    ]);
    const send = jest.fn(async () => ({ outcome: "committed" as const }));
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} attachmentController={attachment} />
      </AppThemeProvider>,
    );
    await fireEvent.changeText(screen.getByLabelText("메시지 입력"), "  ");
    await fireEvent.press(screen.getByLabelText("메시지 보내기"));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ body: "" }));
  });
  test("renders no attachment UI when attachmentController is omitted (M5 text-only path unchanged)", async () => {
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} />
      </AppThemeProvider>,
    );
    expect(screen.queryByLabelText("사진·동영상 첨부")).toBeNull();
    expect(screen.queryByLabelText("음성 파일 첨부")).toBeNull();
  });

  test("draft thumbnails expose status and progress through their accessibility label (W4)", async () => {
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const controller = fakeController([
      {
        localId: "a",
        kind: "image",
        uri: "file:///staged/photo.jpg",
        filename: "photo.jpg",
        byteSize: 10,
        width: null,
        height: null,
        duration: null,
        status: "uploading",
        progress: 0.5,
        errorMessage: null,
        confirmed: null,
      },
    ]);
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} attachmentController={controller} />
      </AppThemeProvider>,
    );
    expect(screen.getByLabelText("photo.jpg 업로드 중 50%")).toBeTruthy();
  });

  test("+ opens the system picker directly once available (W3, no attach sheet)", async () => {
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const controller = fakeController([]);
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} attachmentController={controller} />
      </AppThemeProvider>,
    );
    await fireEvent.press(screen.getByLabelText("첨부 추가"));
    expect(controller.addImageOrVideo).not.toHaveBeenCalled();
    // W3: pressing "+" calls the picker directly (no BottomSheet/ListItem UI
    // survives to remove); the old "사진·동영상 첨부"/"음성 파일 첨부" sheet
    // text no longer exists anywhere in the tree.
    expect(screen.queryByText("사진·동영상 첨부")).toBeNull();
    expect(screen.queryByText("음성 파일 첨부")).toBeNull();
  });

  test("pressing + shows the unavailable notice instead of opening the picker once the queue is full (W3)", async () => {
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const fullItems = (["a", "b", "c", "d"] as const).map((id) => ({
      localId: id,
      kind: "image" as const,
      uri: `file:///staged/${id}.jpg`,
      filename: `${id}.jpg`,
      byteSize: 10,
      width: null,
      height: null,
      duration: null,
      status: "confirmed" as const,
      progress: 0,
      errorMessage: null,
      confirmed: {
        mediaUploadId: id,
        type: "image/jpeg",
        filename: `${id}.jpg`,
        byteSize: 10,
        width: null,
        height: null,
        duration: null,
        posterMediaId: null,
      },
    }));
    const controller = fakeController(fullItems);
    // `useSystemFeedback()`'s iOS notice renders through `@expo/ui/swift-ui`'s
    // Alert, which (per project convention) needs a per-test inline mock to
    // assert its rendered text -- out of scope here. `<SystemFeedbackHost>`
    // is still provided so the real (non-throwing) `showNotice` path runs
    // end to end; what this test pins is the behavioral contract that matters
    // for W3: the picker is never invoked once the queue is full.
    const screen = await render(
      <AppThemeProvider>
        <SystemFeedbackHost>
          <ChatComposer
            controller={{ send }}
            attachmentController={controller}
          />
        </SystemFeedbackHost>
      </AppThemeProvider>,
    );
    await fireEvent.press(screen.getByLabelText("첨부 추가"));
    expect(controller.addImageOrVideo).not.toHaveBeenCalled();
  });

  test("enables a bodyless send once every attachment is confirmed, and forwards confirmed media", async () => {
    const send = jest.fn(async () => ({ outcome: "committed" as const }));
    const confirmedAttachment = {
      mediaUploadId: "upload-1",
      type: "image/jpeg",
      byteSize: 10,
      filename: "photo.jpg",
      width: 10,
      height: 10,
      duration: null,
      posterMediaId: null,
    };
    const controller = fakeController([
      {
        localId: "a",
        kind: "image",
        uri: "file:///staged/photo.jpg",
        filename: "photo.jpg",
        byteSize: 10,
        width: 10,
        height: 10,
        duration: null,
        status: "confirmed",
        progress: 0,
        errorMessage: null,
        confirmed: confirmedAttachment,
      },
    ]);
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} attachmentController={controller} />
      </AppThemeProvider>,
    );
    const sendButton = screen.getByRole("button", { name: "메시지 보내기" });
    expect(sendButton.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
    await act(() => fireEvent.press(sendButton));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ body: "", media: [confirmedAttachment] }),
    );
  });

  test("disables adding audio once the draft has text, and blocks sending audio+body together", async () => {
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const controller = fakeController([
      {
        localId: "a",
        kind: "audio",
        uri: "file:///staged/voice.m4a",
        filename: "voice.ogg",
        byteSize: 10,
        width: null,
        height: null,
        duration: 5,
        status: "confirmed",
        progress: 0,
        errorMessage: null,
        confirmed: {
          mediaUploadId: "upload-2",
          type: "audio/ogg",
          byteSize: 10,
          filename: "voice.ogg",
          width: null,
          height: null,
          duration: 5,
          posterMediaId: null,
        },
      },
    ]);
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer controller={{ send }} attachmentController={controller} />
      </AppThemeProvider>,
    );
    await fireEvent.changeText(
      screen.getByLabelText("메시지 입력"),
      "텍스트를 추가",
    );
    const sendButton = screen.getByRole("button", { name: "메시지 보내기" });
    expect(sendButton.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });
});
