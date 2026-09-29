import { topicDeleteConfirmCopy } from "@/features/topics/model/topic-delete-confirm-copy";

describe("topicDeleteConfirmCopy (E10 exact copy, A1 topic delete)", () => {
  test("주제를 삭제할까요? / 주제 대화방의 메시지와 사진·동영상도 모든 사람에게서 삭제됩니다. / 삭제", () => {
    expect(topicDeleteConfirmCopy()).toEqual({
      confirmLabel: "삭제",
      message:
        "주제 대화방의 메시지와 사진·동영상도 모든 사람에게서 삭제됩니다.",
      title: "주제를 삭제할까요?",
    });
  });
});
