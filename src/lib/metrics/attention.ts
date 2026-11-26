import { isLostLikeStage } from "../stage-style";
import type { Appointment, Lead, PipelineStage } from "../types";
import { NO_SHOW, NOT_CONTACTED, leadJourney } from "./journey";

export type AttentionKind = "upcoming" | "not_contacted" | "no_show" | "follow_up";

export const ATTENTION: Record<AttentionKind, { label: string; hint: string; order: number }> = {
  upcoming: { label: "Appointment soon", hint: "Within the next 2 days: confirm they're coming", order: 0 },
  not_contacted: { label: "Not contacted yet", hint: "In New Lead / No Answer for 2–30 days", order: 1 },
  no_show: { label: "No-show to rebook", hint: "Marked no-show 2–30 days ago, nothing rebooked", order: 2 },
  follow_up: { label: "Showed, needs follow-up", hint: "Showed 7–45 days ago and still waiting", order: 3 },
};

export interface AttentionItem {
  lead: Lead;
  kind: AttentionKind;
  stageName: string | null;
  /** When the reason started: the stage change, or the appointment time for "upcoming". */
  at: string;
}

const DAY = 86_400_000;

/**
 * Open leads that need someone to act, one reason per lead (the most urgent).
 * Uses the same stage-name reading as the journey funnel. Each reason has an
 * upper age limit too: a lead untouched for months is stale, not actionable.
 */
export function needsAttention(leads: Lead[], stages: PipelineStage[], appointments: Appointment[], now: number): AttentionItem[] {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const apptsByLead = new Map<string, Appointment[]>();
  for (const a of appointments) if (a.leadId) apptsByLead.set(a.leadId, [...(apptsByLead.get(a.leadId) ?? []), a]);
  const out: AttentionItem[] = [];
  for (const l of leads) {
    if (l.status !== "open") continue;
    const stage = l.stageId ? stageById.get(l.stageId) : undefined;
    const name = stage?.name ?? "";
    if (isLostLikeStage(name)) continue;
    const appts = (apptsByLead.get(l.id) ?? []).filter((a) => a.ghlStatus !== "cancelled" && a.ghlStatus !== "invalid");
    const future = appts.map((a) => Date.parse(a.startTime)).filter((t) => t >= now).sort((a, b) => a - b);
    const since = l.lastStageChangeAt ?? l.createdAt;
    const age = now - Date.parse(since);
    const j = leadJourney(l, stage, appts);
    let kind: AttentionKind | null = null;
    let at = since;
    if (future.length && future[0] - now <= 2 * DAY) {
      kind = "upcoming";
      at = new Date(future[0]).toISOString();
    } else if (NOT_CONTACTED.test(name) && age >= 2 * DAY && age <= 30 * DAY) kind = "not_contacted";
    else if (NO_SHOW.test(name) && !future.length && age >= 2 * DAY && age <= 30 * DAY) kind = "no_show";
    else if (j.showed && !j.closed && !future.length && age >= 7 * DAY && age <= 45 * DAY) kind = "follow_up";
    if (kind) out.push({ lead: l, kind, stageName: stage?.name ?? null, at });
  }
  // Most urgent group first; within a group, soonest appointment or longest wait first.
  return out.sort((a, b) => ATTENTION[a.kind].order - ATTENTION[b.kind].order || a.at.localeCompare(b.at));
}
