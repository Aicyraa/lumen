import { ApiError } from "./errors.js";

const DAYS = { "7d": 7, "30d": 30 } as const;
export type Range = keyof typeof DAYS;

// `?range=` is 7d (default) or 30d; anything else is a 422.
export function parseRange(v: unknown): { range: Range; days: number } {
  const range = v === undefined ? "7d" : v;
  if (typeof range !== "string" || !Object.hasOwn(DAYS, range))
    throw new ApiError(422, "invalid_request", "range must be 7d or 30d.");
  return { range: range as Range, days: DAYS[range as Range] };
}

// A range covers whole UTC days, today included: 7d = today and the 6 days before it.
export const rangeStart = (days: number, now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));

// First instant of the current calendar month in UTC (the monthly allowance and its meter use the same boundary).
export const MONTH_START_SQL = "(date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')";
