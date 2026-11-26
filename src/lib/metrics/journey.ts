import { isLostLikeStage } from "../stage-style";
import type { Appointment, Lead, PipelineStage } from "../types";

/**
 * The lead journey, read from GHL stage names (and appointments), because a
 * clinic's outcomes live in stages like "No Show" or "Show (needs Follow Up)"
 * rather than on the appointment. Each step is cumulative: a lead that showed
 * also counts as booked and contacted.
 */
export type JourneyStep = "lead" | "contacted" | "booked" | "showed" | "closed";

export const NOT_CONTACTED = /\b(new lead|no answer|not contacted|uncontacted)\b/i;
export const NO_SHOW = /\bno[\s-]?show\b/i;
const SHOWED = /\bshow(ed|n)?\b/i;

export interface LeadJourney {
  contacted: boolean;
  booked: boolean;
  showed: boolean;
  noShow: boolean;
  closed: boolean;
}

/** Where one lead has got to, from its current stage, status and appointments. */
export function leadJourney(l: Lead, stage: PipelineStage | undefined, appts: Appointment[]): LeadJourney {
  const name = stage?.name ?? "";
  const bs = stage?.businessStage ?? null;
  const live = appts.filter((a) => a.ghlStatus !== "cancelled" && a.ghlStatus !== "invalid");
  const closed = l.status === "won" || bs === "closing";
  const noShow = !closed && (NO_SHOW.test(name) || (live.some((a) => a.ghlStatus === "noshow") && !live.some((a) => a.ghlStatus === "showed")));
  const showed =
    closed ||
    (!NO_SHOW.test(name) && SHOWED.test(name)) ||
    live.some((a) => a.ghlStatus === "showed" || a.outcomeOverride === "completed") ||
    bs === "second_call" ||
    bs === "third_call" ||
    bs === "fourth_stage";
  const booked = showed || noShow || live.length > 0 || (bs != null && bs !== "new_lead");
  // Lost-looking stages ("Not Interested") mean someone spoke to them.
  const contacted = booked || isLostLikeStage(name) || (!!stage && !NOT_CONTACTED.test(name));
  return { contacted, booked, showed, noShow, closed };
}

export interface JourneySummary {
  steps: Array<{ key: JourneyStep; label: string; count: number; /** Share of the previous step. */ fromPrev: number | null }>;
  noShows: number;
  /** showed ÷ (showed + no-shows); null when nobody has reached an appointment outcome. */
  showRate: number | null;
}

/** The label for the last step: the stage mapped to Closing when there is exactly one (e.g. "Booked Surgery"). */
export function closedLabel(stages: PipelineStage[]) {
  const names = [...new Set(stages.filter((s) => s.businessStage === "closing").map((s) => s.name.replace(/[^\p{L}\p{N}\s()/&-]/gu, "").trim()))];
  return names.length === 1 ? names[0] : "Closed / won";
}

export function journeySummary(leads: Lead[], stages: PipelineStage[], appointments: Appointment[]): JourneySummary {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const apptsByLead = new Map<string, Appointment[]>();
  for (const a of appointments) if (a.leadId) apptsByLead.set(a.leadId, [...(apptsByLead.get(a.leadId) ?? []), a]);
  let contacted = 0;
  let booked = 0;
  let showed = 0;
  let closed = 0;
  let noShows = 0;
  for (const l of leads) {
    const j = leadJourney(l, l.stageId ? stageById.get(l.stageId) : undefined, apptsByLead.get(l.id) ?? []);
    if (j.contacted) contacted++;
    if (j.booked) booked++;
    if (j.showed) showed++;
    if (j.closed) closed++;
    if (j.noShow) noShows++;
  }
  const raw: Array<[JourneyStep, string, number]> = [
    ["lead", "Leads", leads.length],
    ["contacted", "Contacted", contacted],
    ["booked", "Booked", booked],
    ["showed", "Showed", showed],
    ["closed", closedLabel(stages), closed],
  ];
  return {
    steps: raw.map(([key, label, count], i) => ({ key, label, count, fromPrev: i === 0 ? null : raw[i - 1][2] ? count / raw[i - 1][2] : null })),
    noShows,
    showRate: showed + noShows ? showed / (showed + noShows) : null,
  };
}
