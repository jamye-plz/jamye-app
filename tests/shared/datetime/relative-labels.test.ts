import { formatJamyeTimeLabel } from "@/shared/datetime/relative-labels";

// E6 requires ko-KR, device-timezone labels; fix the process timezone so
// "오늘"/"어제"/"올해" boundaries are deterministic regardless of the host
// running the suite.
process.env.TZ = "Asia/Seoul";

describe("formatJamyeTimeLabel", () => {
  const now = new Date(2026, 8, 27, 15, 12); // 2026-09-27 (Sun) 15:12 KST

  describe("mode: notification", () => {
    test("today shows the clock", () => {
      expect(
        formatJamyeTimeLabel(new Date(2026, 8, 27, 15, 12), {
          mode: "notification",
          now,
        }),
      ).toBe("오후 3:12");
    });

    test("noon and midnight use 12, not 0", () => {
      expect(
        formatJamyeTimeLabel(new Date(2026, 8, 27, 12, 1), {
          mode: "notification",
          now,
        }),
      ).toBe("오후 12:01");
      expect(
        formatJamyeTimeLabel(new Date(2026, 8, 27, 0, 1), {
          mode: "notification",
          now,
        }),
      ).toBe("오전 12:01");
    });

    test("yesterday shows 어제 across a midnight boundary", () => {
      expect(
        formatJamyeTimeLabel(new Date(2026, 8, 26, 23, 59), {
          mode: "notification",
          now,
        }),
      ).toBe("어제");
      expect(
        formatJamyeTimeLabel(new Date(2026, 8, 26, 0, 0), {
          mode: "notification",
          now: new Date(2026, 8, 27, 0, 0),
        }),
      ).toBe("어제");
    });

    test("yesterday crosses a month boundary", () => {
      expect(
        formatJamyeTimeLabel(new Date(2026, 8, 30, 23, 0), {
          mode: "notification",
          now: new Date(2026, 9, 1, 0, 30),
        }),
      ).toBe("어제");
    });

    test("older this year omits the year", () => {
      expect(
        formatJamyeTimeLabel(new Date(2026, 8, 8, 10, 0), {
          mode: "notification",
          now,
        }),
      ).toBe("9월 8일");
    });

    test("older in another year includes it", () => {
      expect(
        formatJamyeTimeLabel(new Date(2025, 8, 8, 10, 0), {
          mode: "notification",
          now,
        }),
      ).toBe("2025년 9월 8일");
    });

    test("a year boundary: yesterday from Jan 1 is last year's Dec 31, not 'older'", () => {
      expect(
        formatJamyeTimeLabel(new Date(2025, 11, 31, 20, 0), {
          mode: "notification",
          now: new Date(2026, 0, 1, 9, 0),
        }),
      ).toBe("어제");
    });
  });

  describe("mode: chatDate", () => {
    test("this year: month, day, weekday", () => {
      expect(
        formatJamyeTimeLabel(new Date(2026, 8, 27, 0, 0), {
          mode: "chatDate",
          now,
        }),
      ).toBe("9월 27일 일요일");
    });

    test("another year includes it", () => {
      expect(
        formatJamyeTimeLabel(new Date(2025, 8, 27, 0, 0), {
          mode: "chatDate",
          now,
        }),
      ).toBe("2025년 9월 27일 토요일");
    });
  });

  describe("mode: chatTime", () => {
    test("formats a bare clock label", () => {
      expect(
        formatJamyeTimeLabel(new Date(2026, 8, 27, 12, 1), {
          mode: "chatTime",
          now,
        }),
      ).toBe("오후 12:01");
    });

    test("accepts an ISO string and epoch ms, not just Date", () => {
      const iso = new Date(2026, 8, 27, 15, 12).toISOString();
      expect(formatJamyeTimeLabel(iso, { mode: "chatTime", now })).toBe(
        "오후 3:12",
      );
      const epochMs = new Date(2026, 8, 27, 15, 12).getTime();
      expect(formatJamyeTimeLabel(epochMs, { mode: "chatTime", now })).toBe(
        "오후 3:12",
      );
    });
  });

  describe("invalid input", () => {
    test("a malformed string returns an empty string instead of throwing", () => {
      expect(
        formatJamyeTimeLabel("not-a-date", { mode: "notification", now }),
      ).toBe("");
      expect(
        formatJamyeTimeLabel("not-a-date", { mode: "chatDate", now }),
      ).toBe("");
      expect(
        formatJamyeTimeLabel("not-a-date", { mode: "chatTime", now }),
      ).toBe("");
    });

    test("NaN and an invalid Date both fall back to an empty string", () => {
      expect(formatJamyeTimeLabel(NaN, { mode: "chatTime", now })).toBe("");
      expect(
        formatJamyeTimeLabel(new Date(NaN), { mode: "chatTime", now }),
      ).toBe("");
    });
  });
});
