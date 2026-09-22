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

/** The calendar day before `date` (`YYYY-MM-DD`), computed in UTC arithmetic. */
export function previousDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  utc.setUTCDate(utc.getUTCDate() - 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/** 오늘 / 어제 for the two most recent days, the ISO date otherwise. */
export function topicDateLabel(date: string, today: string): string {
  if (date === today) return "오늘";
  if (date === previousDay(today)) return "어제";
  return date;
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
