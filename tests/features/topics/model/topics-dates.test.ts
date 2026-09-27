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

  test("T1: labels today and yesterday, older dates as month and day", () => {
    expect(topicDateLabel("2026-09-22", "2026-09-22")).toBe("오늘");
    expect(topicDateLabel("2026-09-21", "2026-09-22")).toBe("어제");
    expect(topicDateLabel("2026-09-11", "2026-09-22")).toBe("9월 11일");
    expect(topicDateLabel("2026-01-02", "2026-09-22")).toBe("1월 2일");
  });

  test("a date from another calendar year carries the year", () => {
    expect(topicDateLabel("2025-12-30", "2026-01-02")).toBe("2025년 12월 30일");
    expect(topicDateLabel("2025-12-31", "2026-01-01")).toBe("어제");
  });

  test("a malformed date is shown as given instead of throwing", () => {
    expect(topicDateLabel("not-a-date", "2026-09-22")).toBe("not-a-date");
  });

  test("dialDates sorts ascending, dedupes and always includes today and the selection", () => {
    expect(
      dialDates(["2026-09-22", "2026-09-11"], "2026-09-22", "2026-09-05"),
    ).toEqual(["2026-09-05", "2026-09-11", "2026-09-22"]);
    expect(dialDates([], "2026-09-22", "")).toEqual(["2026-09-22"]);
  });
});
