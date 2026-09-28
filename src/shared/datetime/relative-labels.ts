/**
 * E6 time labels: ko-KR, device timezone. Every helper here reads `Date`'s
 * local getters (`getFullYear`/`getMonth`/`getDate`/`getHours`/`getMinutes`/
 * `getDay`) instead of passing an explicit `Intl` `timeZone`, so "device
 * timezone" simply falls out of whatever zone the runtime is already
 * configured for (tests fix it by setting `process.env.TZ` before the first
 * `Date` use). Seoul-anchored calendar labels for the topic date dial live
 * separately in `src/features/topics/model/topics-dates.ts` and are
 * untouched by this file.
 */

export type JamyeTimeLabelMode = "notification" | "chatDate" | "chatTime";

export type JamyeTimeLabelOptions = Readonly<{
  /** The instant the label is relative to ("오늘"/"어제"/"올해"). */
  now: Date;
  mode: JamyeTimeLabelMode;
  /** Only "ko-KR" is implemented; reserved for a future locale switch. */
  locale?: "ko-KR";
}>;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function toDate(input: string | number | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function localYesterday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

/** "오후 3:12" / "오전 12:01" -- device-local 12-hour clock, Korean day period. */
function formatClock(date: Date): string {
  const hour24 = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const period = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${period} ${hour12}:${minute}`;
}

/** "9월 8일" -- Korean months are a numeral plus "월", no name table needed. */
function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** `formatMonthDay`, prefixed with "2025년 " once `date` falls outside `now`'s year. */
function formatMonthDayWithYear(date: Date, now: Date): string {
  const monthDay = formatMonthDay(date);
  return date.getFullYear() === now.getFullYear()
    ? monthDay
    : `${date.getFullYear()}년 ${monthDay}`;
}

function formatWeekday(date: Date): string {
  return `${WEEKDAY_KO[date.getDay()]}요일`;
}

/**
 * E6: formats `input` as ko-KR text in the device's timezone.
 * - `notification`: today -> `formatClock` ("오후 3:12"); yesterday -> "어제";
 *   older -> `formatMonthDayWithYear` ("9월 8일" / "2025년 9월 8일").
 * - `chatDate`: `formatMonthDayWithYear` + weekday ("9월 27일 토요일").
 * - `chatTime`: `formatClock` ("오후 12:01").
 *
 * Decision: a malformed `input` (unparsable string/number, invalid `Date`)
 * returns `""` instead of throwing, so a render never crashes over a bad
 * timestamp -- callers that must tell "no label" apart from "empty message"
 * should validate the input themselves before calling.
 */
export function formatJamyeTimeLabel(
  input: string | number | Date,
  { now, mode }: JamyeTimeLabelOptions,
): string {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "";

  if (mode === "chatTime") return formatClock(date);
  if (mode === "chatDate") {
    return `${formatMonthDayWithYear(date, now)} ${formatWeekday(date)}`;
  }
  if (isSameLocalDay(date, now)) return formatClock(date);
  if (isSameLocalDay(date, localYesterday(now))) return "어제";
  return formatMonthDayWithYear(date, now);
}
