import React from "react";
import { render } from "@testing-library/react-native";
import { ChatMessageRow } from "@/features/chat/ui/chat-message-row";
import { darkTheme, lightTheme } from "@/core/theme/tokens";

jest.mock("@/features/media/ui/media-image-viewer", () => ({
  MediaImageViewer: () => null,
}));

let mockColors = lightTheme.colors;
jest.mock("@/core/theme/theme-provider", () => ({
  useAppTheme: () => ({ colors: mockColors }),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
jest.mock("@/features/media/ui/use-media-download", () => ({
  useMediaDownload: () => ({
    available: true,
    status: "idle",
    errorMessage: null,
    openOrSave: jest.fn(),
  }),
}));

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
};

test.each([lightTheme, darkTheme])(
  "outgoing media actions contrast against the $colorScheme message bubble",
  async (theme) => {
    mockColors = theme.colors;
    const screen = await render(
      <ChatMessageRow
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
      />,
    );
    expect(screen.getByText("열기·저장")).toHaveStyle({
      color: theme.colors.onPrimary,
    });
    expect(
      screen.getByRole("button", { name: "첨부 동영상 재생" }),
    ).toBeTruthy();
    expect(screen.getByText("동영상")).toBeTruthy();
  },
);
