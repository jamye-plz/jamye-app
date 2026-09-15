import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { ChatComposer } from "@/features/chat/ui/chat-composer";
import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
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

  test("shows the attach queue and the attach sheet options once a controller is supplied", async () => {
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const controller = fakeController([
      {
        localId: "a",
        kind: "image",
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
    expect(screen.getByText("photo.jpg")).toBeTruthy();
    expect(screen.getByText(/50%/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("첨부 추가"));
    expect(screen.getByText("사진·동영상 첨부")).toBeTruthy();
    expect(screen.getByText("음성 파일 첨부")).toBeTruthy();
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
    };
    const controller = fakeController([
      {
        localId: "a",
        kind: "image",
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
