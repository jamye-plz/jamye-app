import {
  decideNewMessageScroll,
  isScrollNearBottom,
} from "@/features/chat/model/chat-new-message-scroll";

describe("isScrollNearBottom (R4)", () => {
  test("is true exactly at the bottom", () => {
    expect(
      isScrollNearBottom({
        contentOffset: 400,
        contentHeight: 700,
        viewportHeight: 300,
      }),
    ).toBe(true);
  });

  test("is true within the default threshold of the bottom", () => {
    expect(
      isScrollNearBottom({
        contentOffset: 350,
        contentHeight: 700,
        viewportHeight: 300,
      }),
    ).toBe(true);
  });

  test("is false well above the bottom", () => {
    expect(
      isScrollNearBottom({
        contentOffset: 0,
        contentHeight: 1_000,
        viewportHeight: 300,
      }),
    ).toBe(false);
  });

  test("honors a custom threshold", () => {
    expect(
      isScrollNearBottom({
        contentOffset: 300,
        contentHeight: 700,
        viewportHeight: 300,
        thresholdPx: 50,
      }),
    ).toBe(false);
  });
});

describe("decideNewMessageScroll (R4, keeps E11 commit-only reveal)", () => {
  test("does nothing on the very first render (no previous tail yet)", () => {
    expect(
      decideNewMessageScroll({
        previousTailLocalId: null,
        nextTailLocalId: "a",
        isNearBottom: true,
        commitRevealTarget: null,
      }),
    ).toBe("none");
  });

  test("does nothing when the tail did not change", () => {
    expect(
      decideNewMessageScroll({
        previousTailLocalId: "a",
        nextTailLocalId: "a",
        isNearBottom: false,
        commitRevealTarget: null,
      }),
    ).toBe("none");
  });

  test("auto-scrolls a new incoming tail message when near the bottom", () => {
    expect(
      decideNewMessageScroll({
        previousTailLocalId: "a",
        nextTailLocalId: "b",
        isNearBottom: true,
        commitRevealTarget: null,
      }),
    ).toBe("auto-scroll");
  });

  test("shows the pill for a new incoming tail message while reading further up", () => {
    expect(
      decideNewMessageScroll({
        previousTailLocalId: "a",
        nextTailLocalId: "b",
        isNearBottom: false,
        commitRevealTarget: null,
      }),
    ).toBe("show-pill");
  });

  test("never double-handles the user's own just-committed message, at any scroll position", () => {
    expect(
      decideNewMessageScroll({
        previousTailLocalId: "a",
        nextTailLocalId: "my-new-message",
        isNearBottom: false,
        commitRevealTarget: "my-new-message",
      }),
    ).toBe("none");
  });
});
