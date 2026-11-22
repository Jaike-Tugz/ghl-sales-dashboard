/**
 * Timezone-aware date boundaries without extra dependencies.
 *
 * A reporting day is the half-open interval [local 00:00, next local 00:00)
 * in the configured reporting timezone, converted to UTC instants. A range
 * `from..to` (inclusive calendar dates) is therefore
 * [startOfDay(from), startOfDay(to + 1 day)). DST transitions are handled by
 * re-resolving the zone offset at the computed instant.
 */

const DAY_MS = 86_400_000;

function partsInZone(instant: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(instant))) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  return map as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `timeZone` from UTC at `instant`, in ms (positive east of UTC). */
export function zoneOffsetMs(instant: number, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = instant - (((instant % 1000) + 1000) % 1000);
  return asUtc - truncated;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** UTC instant (ms) of local midnight for a YYYY-MM-DD date in `timeZone`. */
export function startOfLocalDay(date: string, timeZone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let result = guess - zoneOffsetMs(guess, timeZone);
  // Re-resolve once: the offset at the real instant can differ around DST.
  const corrected = guess - zoneOffsetMs(result, timeZone);
  if (corrected !== result) result = corrected;
  return result;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return t.toISOString().slice(0, 10);
}

/** Local calendar date (YYYY-MM-DD) of an instant in `timeZone`. */
export function localDate(instant: number | string | Date, timeZone: string): string {
  const ms = typeof instant === "number" ? instant : new Date(instant).getTime();
  const p = partsInZone(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export interface Range {
  start: number;
  end: number; // exclusive
}

export function rangeFromDates(from: string, to: string, timeZone: string): Range {
  return { start: startOfLocalDay(from, timeZone), end: startOfLocalDay(addDays(to, 1), timeZone) };
}

export function inRange(value: string | null | undefined, range: Range): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  return Number.isFinite(t) && t >= range.start && t < range.end;
}

/** Monday-start ISO week bucket label, e.g. "2026-11-16". */
export function bucketKey(date: string, granularity: "day" | "week" | "month"): string {
  if (granularity === "day") return date;
  if (granularity === "month") return date.slice(0, 7);
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  const back = (dow + 6) % 7;
  return addDays(date, -back);
}

/** All bucket keys covering [from, to]. */
export function bucketsBetween(from: string, to: string, granularity: "day" | "week" | "month"): string[] {
  const keys: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard++ < 2000) {
    const k = bucketKey(cursor, granularity);
    if (keys[keys.length - 1] !== k) keys.push(k);
    cursor = addDays(cursor, 1);
  }
  return keys;
}

export function daysBetween(a: string | number, b: string | number): number {
  const ta = typeof a === "number" ? a : new Date(a).getTime();
  const tb = typeof b === "number" ? b : new Date(b).getTime();
  return (tb - ta) / DAY_MS;
}

export function todayIn(timeZone: string, now = Date.now()): string {
  return localDate(now, timeZone);
}

export type RangePreset = "7d" | "30d" | "90d" | "mtd" | "qtd" | "ytd" | "12m";

export function presetRange(preset: RangePreset, timeZone: string, now = Date.now()): { from: string; to: string } {
  const to = todayIn(timeZone, now);
  switch (preset) {
    case "7d":
      return { from: addDays(to, -6), to };
    case "30d":
      return { from: addDays(to, -29), to };
    case "90d":
      return { from: addDays(to, -89), to };
    case "mtd":
      return { from: `${to.slice(0, 7)}-01`, to };
    case "qtd": {
      const m = Number(to.slice(5, 7));
      const qm = String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0");
      return { from: `${to.slice(0, 4)}-${qm}-01`, to };
    }
    case "ytd":
      return { from: `${to.slice(0, 4)}-01-01`, to };
    case "12m":
      return { from: addDays(to, -364), to };
  }
}
