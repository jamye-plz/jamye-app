import { render, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { ChatMessageRowMeta } from "@/features/chat/model/chat-message-grouping";
import type { ChatMessage } from "@/features/chat/model/chat-message-window";
import { ChatMessageRow } from "@/features/chat/ui/chat-message-row";

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
}));

// The attachment grid (and its reanimated viewer) has its own tests; here it
// is a placeholder the layout assertions can find.
jest.mock("@/features/media/ui/message-attachments-view", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MessageAttachmentsView: () => <View testID="message-attachments" />,
  };
});

// The platform menus are covered by their own tests; here the bubble only
// needs to render in place.
jest.mock("@/features/chat/ui/chat-message-menu", () => ({
  ChatMessageMenu: ({ children }: Readonly<{ children?: ReactNode }>) =>
    children,
}));

const incomingMeta: ChatMessageRowMeta = {
  dateSeparatorLabel: "",
  isGroupedWithPrevious: false,
  isLastInGroup: true,
  isOutgoing: false,
  isSystem: false,
  localId: "m1",
  showDateSeparator: false,
  showSentStatus: false,
  timeLabel: "오후 3:10",
};

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    body: "안녕하세요",
    clientMsgId: "client-1",
    conversationId: "conversation-1",
    createdAtMs: 0,
    localId: "m1",
    senderId: "user-2",
    senderLabel: "민수",
    status: "sent",
    ...overrides,
  };
}

async function renderRow(meta: ChatMessageRowMeta, row: ChatMessage) {
  return render(
    <AppThemeProvider>
      <ChatMessageRow
        message={row}
        onRetryFailedMessage={jest.fn()}
        onShareAttachment={jest.fn()}
        rowMeta={meta}
      />
    </AppThemeProvider>,
  );
}

type RenderedNode = ReturnType<
  Awaited<ReturnType<typeof renderRow>>["getByTestId"]
>;

function flatStyle(node: RenderedNode): ViewStyle {
  return StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) ?? {};
}

function closestRow(node: RenderedNode): RenderedNode {
  let current = node.parent;
  while (current) {
    if (flatStyle(current).flexDirection === "row") return current;
    current = current.parent;
  }
  throw new Error("no row container");
}

describe("ChatMessageRow R1 layout (device regressions)", () => {
  test("a long unbroken body gets a numeric bubble max width, so it wraps inside content-sized menu hosts", async () => {
    const url = `https://example.com/${"a".repeat(120)}`;
    const screen = await renderRow(incomingMeta, message({ body: url }));
    const bubble = screen.getByLabelText(`${url}, 전송됨`);
    expect(typeof flatStyle(bubble).maxWidth).toBe("number");
  });

  test("the incoming group's time sits under the bubble column, not beside the avatar", async () => {
    const screen = await renderRow(incomingMeta, message());
    const row = closestRow(screen.getByTestId("chat-row-avatar"));
    expect(within(row).getByLabelText("안녕하세요, 전송됨")).toBeTruthy();
    expect(within(row).queryByText("오후 3:10")).toBeNull();
    expect(screen.getByText("오후 3:10")).toBeTruthy();
  });

  test("my last bubble's `시간 · 전송됨` renders below the bubble, not inside it", async () => {
    const screen = await renderRow(
      { ...incomingMeta, isOutgoing: true, showSentStatus: true },
      message({ body: "보냄", senderLabel: undefined }),
    );
    const bubble = screen.getByLabelText("보냄, 오후 3:10 · 전송됨");
    expect(within(bubble).queryByText("오후 3:10 · 전송됨")).toBeNull();
    expect(screen.getByText("오후 3:10 · 전송됨")).toBeTruthy();
  });

  test("R3: photos sit outside the colored text bubble, which follows below them", async () => {
    const screen = await renderRow(
      incomingMeta,
      message({
        body: "사진 설명",
        media: [
          {
            duration: null,
            filename: "a.png",
            height: 400,
            id: "media-1",
            position: 0,
            posterMediaId: null,
            type: "image/png",
            width: 600,
          },
        ] as unknown as ChatMessage["media"],
      }),
    );
    const textBubble = screen.getByLabelText("사진 설명, 전송됨");
    expect(within(textBubble).queryByTestId("message-attachments")).toBeNull();
    expect(screen.getByTestId("message-attachments")).toBeTruthy();
  });

  test("a failed message's retry sits on my side, not stretched across the row", async () => {
    const screen = await renderRow(
      { ...incomingMeta, isOutgoing: true },
      message({ body: "보냄", senderLabel: undefined, status: "failed" }),
    );
    // The native button's host stretches across its parent (Android lays the
    // label out at the start of that width), so the parent must hug it.
    let host = screen.getByRole("button", {
      name: "메시지 다시 보내기",
    }).parent;
    while (host && flatStyle(host).alignSelf !== "stretch") host = host.parent;
    expect(host).toBeTruthy();
    expect(flatStyle(host!.parent!).alignSelf).toBe("flex-end");
  });

  test("an earlier outgoing group ends in its time only", async () => {
    const screen = await renderRow(
      { ...incomingMeta, isOutgoing: true },
      message({ body: "보냄", senderLabel: undefined }),
    );
    expect(screen.getByText("오후 3:10")).toBeTruthy();
    expect(screen.queryByText(/전송됨/)).toBeNull();
  });
});
