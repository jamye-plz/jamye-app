/**
 * Seoul-calendar helpers for the topic date dial. The server reports dates as
 * `YYYY-MM-DD` in Asia/Seoul; the dial labels them relative to that "today".
 */
export function seoulToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

/** A `YYYY-MM-DD` calendar date as UTC midnight (Invalid Date if malformed). */
function utcDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

/** The calendar day before `date` (`YYYY-MM-DD`), computed in UTC arithmetic. */
export function previousDay(date: string): string {
  const utc = utcDate(date);
  utc.setUTCDate(utc.getUTCDate() - 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/**
 * Date chip label (T1): 오늘 / 어제 for the two most recent days, otherwise
 * "9월 11일", with the year in front for another calendar year so a strip
 * that crosses New Year stays unambiguous ("2025년 12월 30일").
 */
export function topicDateLabel(date: string, today: string): string {
  if (date === today) return "오늘";
  if (date === previousDay(today)) return "어제";
  const utc = utcDate(date);
  if (Number.isNaN(utc.getTime())) return date;
  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(utc);
}

/**
 * Dial order: oldest on the left, today on the right. Today and the current
 * selection are always present so the dial can center on them even when the
 * server's date page does not list them.
 */
export function dialDates(
  dates: readonly string[],
  today: string,
  selected: string,
): readonly string[] {
  return [...new Set([...dates, today, selected].filter(Boolean))].sort();
}

/** Article-header byline date (D1), e.g. "9월 11일" -- the same "month day"
 * shape as `topicDateLabel`'s older dates, but from a full `createdAt` timestamp. */
export function topicCreatedAtLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("ko-KR", {
        day: "numeric",
        month: "long",
        timeZone: "Asia/Seoul",
      }).format(date);
}
