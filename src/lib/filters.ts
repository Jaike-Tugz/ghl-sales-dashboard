import { CALL_OUTCOMES, type BusinessStageKey, type CallOutcome, type Filters } from "./types";
import { BUSINESS_STAGE_ORDER } from "./settings-defaults";
import { presetRange, type RangePreset } from "./time";

export type SearchParams = Record<string, string | string[] | undefined>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRESETS: RangePreset[] = ["7d", "30d", "90d", "mtd", "qtd", "ytd", "12m"];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Global filters live in the URL so every page, chart, table and CSV export
 * reads the same account/date selection. Unknown values fall back to safe
 * defaults; an account the viewer cannot see falls back to "all" (which RLS
 * has already narrowed to what they may see).
 */
export function parseFilters(sp: SearchParams, timeZone: string, visibleAccountIds: string[]): Filters & { preset: RangePreset | "custom" } {
  const acc = one(sp.account);
  const accountId = acc && visibleAccountIds.includes(acc) ? acc : "all";
  const presetParam = one(sp.range) as RangePreset | "custom" | undefined;
  let from = one(sp.from);
  let to = one(sp.to);
  let preset: RangePreset | "custom" = "30d";
  if (presetParam === "custom" && from && to && DATE.test(from) && DATE.test(to)) {
    preset = "custom";
    if (from > to) [from, to] = [to, from];
  } else {
    preset = PRESETS.includes(presetParam as RangePreset) ? (presetParam as RangePreset) : "30d";
    ({ from, to } = presetRange(preset, timeZone));
  }
  const g = one(sp.granularity);
  const span = (Date.parse(to!) - Date.parse(from!)) / 86_400_000;
  const granularity = g === "day" || g === "week" || g === "month" ? g : span > 120 ? "month" : span > 31 ? "week" : "day";
  const stage = one(sp.stage);
  const outcome = one(sp.outcome);
  return {
    accountId,
    from: from!,
    to: to!,
    preset,
    granularity,
    repId: one(sp.rep) || undefined,
    stage: BUSINESS_STAGE_ORDER.includes(stage as BusinessStageKey) ? (stage as BusinessStageKey) : undefined,
    outcome: CALL_OUTCOMES.includes(outcome as CallOutcome) ? (outcome as CallOutcome) : undefined,
    q: one(sp.q)?.slice(0, 100) || undefined,
  };
}
