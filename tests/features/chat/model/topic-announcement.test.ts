import { parseTopicAnnouncement } from "@/features/chat/model/topic-announcement";

describe("parseTopicAnnouncement (CHAT-AC1)", () => {
  test("parses the exact server shape into a prefix/title/href", () => {
    const result = parseTopicAnnouncement(
      "새로운 주제를 올렸어요: [주말 등산](/groups/g-1/topics/t-1/chat)",
    );
    expect(result).toEqual({
      prefix: "새로운 주제를 올렸어요: ",
      title: "주말 등산",
      groupId: "g-1",
      topicId: "t-1",
      href: {
        pathname: "/groups/[groupId]/topics/[topicId]",
        params: { groupId: "g-1", topicId: "t-1" },
      },
    });
  });

  test("unescapes only \\\\, \\[, \\], \\(, \\) in the title", () => {
    const result = parseTopicAnnouncement(
      "새로운 주제를 올렸어요: [A\\[B\\]C\\(D\\)E\\\\F](/groups/g-1/topics/t-1/chat)",
    );
    expect(result?.title).toBe("A[B]C(D)E\\F");
  });

  test("returns null for a body that is not the exact announcement shape", () => {
    expect(parseTopicAnnouncement("그냥 텍스트 메시지입니다.")).toBeNull();
  });

  test("returns null for a general markdown link (not the server's own path shape)", () => {
    expect(
      parseTopicAnnouncement(
        "새로운 주제를 올렸어요: [제목](https://example.com/evil)",
      ),
    ).toBeNull();
  });

  test("returns null when the path is missing the trailing /chat segment", () => {
    expect(
      parseTopicAnnouncement(
        "새로운 주제를 올렸어요: [제목](/groups/g-1/topics/t-1)",
      ),
    ).toBeNull();
  });
});
