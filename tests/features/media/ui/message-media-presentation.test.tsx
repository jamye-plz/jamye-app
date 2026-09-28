import React from "react";
import { render } from "@testing-library/react-native";
import { ChatMessageRow } from "@/features/chat/ui/chat-message-row";
import type { ChatMessageRowMeta } from "@/features/chat/model/chat-message-grouping";
import { darkTheme, lightTheme } from "@/core/theme/tokens";

jest.mock("@/features/media/ui/media-image-viewer", () => ({
  MediaImageViewer: () => null,
}));

let mockColors = lightTheme.colors;
jest.mock("@/core/theme/theme-provider", () => ({
  useAppTheme: () => ({ colors: mockColors }),
  useAppThemeOrSystem: () => ({ colors: mockColors }),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));
jest.mock("@/features/media/ui/use-media-download", () => ({
  useMediaDownload: () => ({
    available: true,
    status: "idle",
    errorMessage: null,
    openOrSave: jest.fn(),
  }),
}));
// Observes the real hook's call args (mediaId/enabled/posterMediaId) without
// replacing its behaviour -- there is no MediaRuntimeProvider in this file, so
// the real hook is already an inert no-op (`access`/`runtime` are both null).
const mockMediaVideoThumbnailSpy = jest.fn();
jest.mock("@/features/media/ui/use-media-video-thumbnail", () => {
  const actual = jest.requireActual<
    typeof import("@/features/media/ui/use-media-video-thumbnail")
  >("@/features/media/ui/use-media-video-thumbnail");
  return {
    useMediaVideoThumbnail: (
      ...args: Parameters<typeof actual.useMediaVideoThumbnail>
    ) => {
      mockMediaVideoThumbnailSpy(...args);
      return actual.useMediaVideoThumbnail(...args);
    },
  };
});
beforeEach(() => {
  mockMediaVideoThumbnailSpy.mockClear();
});

/** Minimal `ChatMessageRowMeta` for an outgoing, non-grouped, non-system row
 * -- this file only cares about how R3 attachments render, not R1/R4's
 * grouping/date-separator decisions (covered by
 * `chat-message-grouping.test.ts`, owned by task-app-chat-list). */
function outgoingRowMeta(
  overrides: Partial<ChatMessageRowMeta> = {},
): ChatMessageRowMeta {
  return {
    localId: "local-1",
    isSystem: false,
    isOutgoing: true,
    isGroupedWithPrevious: false,
    isLastInGroup: true,
    showDateSeparator: false,
    dateSeparatorLabel: "",
    timeLabel: "오후 12:01",
    showSentStatus: false,
    ...overrides,
  };
}

const video = {
  id: "11111111-1111-4111-8111-111111111111",
  mediaUploadId: "upload-1",
  position: 0,
  type: "video/mp4",
  filename: null,
  byteSize: 1_024,
  duration: null,
  width: 320,
  height: 240,
  posterMediaId: null,
};

test.each([lightTheme, darkTheme])(
  "an outgoing video attachment renders through ChatMessageRow -> MessageAttachmentsView -> MediaVideoCard in the $colorScheme theme",
  async (theme) => {
    mockColors = theme.colors;
    const screen = await render(
      <ChatMessageRow
        rowMeta={outgoingRowMeta()}
        message={{
          localId: "local-1",
          conversationId: "room-1",
          clientMsgId: "client-1",
          body: "",
          status: "sent",
          senderLabel: "나",
          isOutgoing: true,
          createdAtMs: 1,
          senderId: "self",
          media: [video],
        }}
        onRetryFailedMessage={jest.fn()}
        onShareAttachment={jest.fn()}
      />,
    );
    // R3: the per-attachment share icon (`MediaOpenSaveButton`) is gone --
    // save/share now only happens through the message menu (`onShareAttachment`)
    // and the full-screen viewer.
    expect(
      screen.queryByRole("button", { name: "첨부 파일 열기 또는 저장" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "첨부 동영상 재생" }),
    ).toBeTruthy();
  },
);

test("passes the item's posterMediaId through row -> MessageAttachmentsView -> card -> the thumbnail hook, including for a pending (optimistic) row", async () => {
  mockColors = lightTheme.colors;
  const posterId = "22222222-2222-4222-8222-222222222222";
  const posterVideo = {
    ...video,
    id: "33333333-3333-4333-8333-333333333333",
    posterMediaId: posterId,
  };
  await render(
    <ChatMessageRow
      rowMeta={outgoingRowMeta()}
      message={{
        localId: "local-2",
        conversationId: "room-1",
        clientMsgId: "client-2",
        body: "",
        status: "pending",
        senderLabel: "나",
        isOutgoing: true,
        createdAtMs: 1,
        senderId: "self",
        media: [posterVideo],
      }}
      onRetryFailedMessage={jest.fn()}
      onShareAttachment={jest.fn()}
    />,
  );
  expect(mockMediaVideoThumbnailSpy).toHaveBeenCalledWith(
    posterVideo.id,
    false,
    posterId,
  );
});

test("passes null through when the item has no posterMediaId", async () => {
  mockColors = lightTheme.colors;
  await render(
    <ChatMessageRow
      rowMeta={outgoingRowMeta()}
      message={{
        localId: "local-3",
        conversationId: "room-1",
        clientMsgId: "client-3",
        body: "",
        status: "sent",
        senderLabel: "나",
        isOutgoing: true,
        createdAtMs: 1,
        senderId: "self",
        media: [video],
      }}
      onRetryFailedMessage={jest.fn()}
      onShareAttachment={jest.fn()}
    />,
  );
  expect(mockMediaVideoThumbnailSpy).toHaveBeenCalledWith(
    video.id,
    false,
    null,
  );
});

test("an incoming video attachment still renders through the same chain (no crash without a sender avatar)", async () => {
  mockColors = lightTheme.colors;
  const screen = await render(
    <ChatMessageRow
      rowMeta={outgoingRowMeta({ isOutgoing: false, isLastInGroup: true })}
      message={{
        localId: "local-4",
        conversationId: "room-1",
        clientMsgId: null,
        body: "",
        status: "sent",
        senderLabel: "상대방",
        isOutgoing: false,
        createdAtMs: 1,
        senderId: "other",
        media: [video],
      }}
      onRetryFailedMessage={jest.fn()}
      onShareAttachment={jest.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "첨부 동영상 재생" })).toBeTruthy();
});
