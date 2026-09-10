const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;
const DAYS_IN_MONTH = Object.freeze([
  31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
]);

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidDateTime(value: string): boolean {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12) return false;
  if (hour > 23 || minute > 59 || second > 60) return false;

  const maxDay =
    month === 2 && !isLeapYear(year) ? 28 : DAYS_IN_MONTH[month - 1];
  return day >= 1 && day <= maxDay;
}

function isValidUri(value: string): boolean {
  try {
    void new URL(value);
    return true;
  } catch {
    return false;
  }
}

type AjvLike = Readonly<{
  addFormat: (
    name: string,
    definition:
      | RegExp
      | Readonly<{ type: "string"; validate: (value: string) => boolean }>
      | Readonly<{ type: "number"; validate: (value: number) => boolean }>,
  ) => unknown;
}>;

/**
 * Ajv ignores unknown "format" keywords under strict:false instead of
 * rejecting them, which would silently accept malformed UUID/date-time
 * values. Registering explicit, tested handlers keeps those formats
 * enforced rather than disabled.
 */
export function registerServerContractFormats(ajv: AjvLike): void {
  ajv.addFormat("uuid", UUID_PATTERN);
  ajv.addFormat("date-time", { type: "string", validate: isValidDateTime });
  ajv.addFormat("uri", { type: "string", validate: isValidUri });
  // S1/realtime schemas also annotate integer widths. Enforce them rather
  // than emitting an unknown-format warning for every imported validator.
  for (const [name, minimum, exclusiveMaximum] of [
    ["int32", -(2 ** 31), 2 ** 31],
    ["int64", -(2 ** 63), 2 ** 63],
    ["uint8", 0, 2 ** 8],
    ["uint32", 0, 2 ** 32],
    ["uint64", 0, 2 ** 64],
  ] as const) {
    ajv.addFormat(name, {
      type: "number",
      validate: (value) =>
        Number.isInteger(value) && value >= minimum && value < exclusiveMaximum,
    });
  }
}
