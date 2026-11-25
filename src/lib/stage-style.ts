import type { BusinessStageKey, Lead, PipelineStage } from "./types";

/**
 * GHL's API does not expose pipeline stage colours, so each stage gets a tone
 * from what it means: lost-looking stages are grey, everything else follows its
 * mapped business stage. The tone is a CSS colour usable for dots and bars.
 */
export type StageTone = "slate" | "sky" | "violet" | "amber" | "orange" | "teal" | "emerald";

export const TONE_COLOR: Record<StageTone, string> = {
  slate: "oklch(0.68 0.015 260)",
  sky: "oklch(0.64 0.13 245)",
  violet: "oklch(0.6 0.15 290)",
  amber: "oklch(0.76 0.14 75)",
  orange: "oklch(0.68 0.16 45)",
  teal: "oklch(0.64 0.1 190)",
  emerald: "oklch(0.62 0.13 158)",
};

const BY_BUSINESS_STAGE: Record<BusinessStageKey, StageTone> = {
  new_lead: "sky",
  first_call: "violet",
  second_call: "amber",
  third_call: "orange",
  fourth_stage: "teal",
  closing: "emerald",
};

const LOST_WORDS = /\b(lost|not interested|disqualified|dead|closed lost|unqualified|not a candidate|do not contact)\b/i;

export function isLostLikeStage(name: string) {
  return LOST_WORDS.test(name);
}

export function stageTone(stage: Pick<PipelineStage, "name" | "businessStage">): StageTone {
  if (isLostLikeStage(stage.name)) return "slate";
  return stage.businessStage ? BY_BUSINESS_STAGE[stage.businessStage] : "slate";
}

export interface StageCount {
  /** Stage name, used as the key: sub-accounts that share a stage name are counted together. */
  name: string;
  stageIds: string[];
  count: number;
  tone: StageTone;
}

/**
 * Lead counts per stage for the pipelines that hold the given leads, in
 * pipeline order, including empty stages. Stages with the same name in
 * different sub-accounts merge into one entry so "All accounts" stays readable.
 */
export function stageCounts(leads: Lead[], stages: PipelineStage[]): StageCount[] {
  const pipelineIds = new Set(leads.map((l) => l.pipelineId));
  const perStage = new Map<string, number>();
  for (const l of leads) if (l.stageId) perStage.set(l.stageId, (perStage.get(l.stageId) ?? 0) + 1);
  const out = new Map<string, StageCount & { position: number }>();
  for (const st of stages.filter((x) => pipelineIds.has(x.pipelineId)).sort((a, b) => a.position - b.position)) {
    const key = st.name.trim();
    const cur = out.get(key) ?? { name: key, stageIds: [], count: 0, tone: stageTone(st), position: st.position };
    cur.stageIds.push(st.id);
    cur.count += perStage.get(st.id) ?? 0;
    out.set(key, cur);
  }
  return [...out.values()].sort((a, b) => a.position - b.position).map(({ position: _p, ...c }) => c);
}
