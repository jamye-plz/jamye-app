import {
  dialDates,
  previousDay,
  seoulToday,
  topicDateLabel,
} from "@/features/topics/model/topics-dates";

describe("topic dates (Seoul calendar)", () => {
  test("seoulToday formats the Asia/Seoul calendar date, not the UTC date", () => {
    expect(seoulToday(new Date("2026-09-22T16:30:00Z"))).toBe("2026-09-23");
    expect(seoulToday(new Date("2026-09-22T14:59:00Z"))).toBe("2026-09-22");
  });

  test("previousDay crosses month and year boundaries", () => {
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
    expect(previousDay("2026-09-22")).toBe("2026-09-21");
  });

  test("labels today and yesterday, everything else stays an ISO date", () => {
    expect(topicDateLabel("2026-09-22", "2026-09-22")).toBe("오늘");
    expect(topicDateLabel("2026-09-21", "2026-09-22")).toBe("어제");
    expect(topicDateLabel("2026-09-11", "2026-09-22")).toBe("2026-09-11");
  });

  test("dialDates sorts ascending, dedupes and always includes today and the selection", () => {
    expect(
      dialDates(["2026-09-22", "2026-09-11"], "2026-09-22", "2026-09-05"),
    ).toEqual(["2026-09-05", "2026-09-11", "2026-09-22"]);
    expect(dialDates([], "2026-09-22", "")).toEqual(["2026-09-22"]);
  });
});
