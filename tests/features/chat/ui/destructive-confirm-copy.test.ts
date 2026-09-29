import { destructiveConfirmCopy } from "@/features/chat/model/destructive-confirm-copy";

describe("destructiveConfirmCopy (E10 exact copy, AC3 delete / AC5 discard)", () => {
  test("delete: 메시지를 삭제할까요? / 모든 사람의 대화방에서 삭제됩니다. / 삭제", () => {
    expect(
      destructiveConfirmCopy({
        chatroomId: "room-1",
        kind: "delete",
        serverMessageId: "server-1",
      }),
    ).toEqual({
      confirmLabel: "삭제",
      message: "모든 사람의 대화방에서 삭제됩니다.",
      title: "메시지를 삭제할까요?",
    });
  });

  test("discard: 메시지를 버릴까요? / 전송하지 못한 메시지를 이 기기에서 지웁니다. / 버리기", () => {
    expect(
      destructiveConfirmCopy({ clientMsgId: "client-1", kind: "discard" }),
    ).toEqual({
      confirmLabel: "버리기",
      message: "전송하지 못한 메시지를 이 기기에서 지웁니다.",
      title: "메시지를 버릴까요?",
    });
  });
});
