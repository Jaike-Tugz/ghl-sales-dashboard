import type { BusinessStageKey, Lead, PipelineStage } from "./types";

/**
 * GHL's API does not expose pipeline stage colours, so a stage's colour shows
 * how far along it is: one blue that gets darker (lighter in dark mode) as a
 * lead progresses, and grey for lost-looking stages. Four levels, because more
 * steps of one hue can't be told apart (validated ordinal ramp, see globals.css).
 */
export type StageTone = "s1" | "s2" | "s3" | "s4" | "lost";

export const TONE_COLOR: Record<StageTone, string> = {
  s1: "var(--stage-1)",
  s2: "var(--stage-2)",
  s3: "var(--stage-3)",
  s4: "var(--stage-4)",
  lost: "var(--stage-lost)",
};

const BY_BUSINESS_STAGE: Record<BusinessStageKey, StageTone> = {
  new_lead: "s1",
  first_call: "s2",
  second_call: "s3",
  third_call: "s3",
  fourth_stage: "s3",
  closing: "s4",
};

const LOST_WORDS = /\b(lost|not interested|disqualified|dead|closed lost|unqualified|not a candidate|do not contact)\b/i;

export function isLostLikeStage(name: string) {
  return LOST_WORDS.test(name);
}

export function stageTone(stage: Pick<PipelineStage, "name" | "businessStage">): StageTone {
  if (isLostLikeStage(stage.name)) return "lost";
  return stage.businessStage ? BY_BUSINESS_STAGE[stage.businessStage] : "lost";
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
