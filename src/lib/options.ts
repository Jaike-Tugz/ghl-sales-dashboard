import { OUTCOME_LABELS } from "./settings-defaults";
import type { AppSettings, Dataset } from "./types";

/** Filter dropdown options. Reps are grouped by person so one human = one option across accounts. */
export function repOptions(ds: Dataset) {
  const seen = new Map<string, string>();
  for (const r of ds.reps) if (!seen.has(r.personKey)) seen.set(r.personKey, r.name);
  return [...seen].map(([k, name]) => ({ value: `person:${k}`, label: name })).sort((a, b) => a.label.localeCompare(b.label));
}
export const stageOptions = (s: AppSettings) => s.funnelStages.filter((x) => x.enabled).map((x) => ({ value: x.key, label: x.label }));
export const outcomeOptions = () => Object.entries(OUTCOME_LABELS).map(([value, label]) => ({ value, label }));
