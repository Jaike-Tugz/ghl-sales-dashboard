import { isLostLikeStage } from "../stage-style";
import type { Appointment, Lead, PipelineStage } from "../types";

/** Dimensions a lead can be grouped by for source reporting. */
export const SOURCE_DIMENSIONS = [
  { key: "source", label: "Source", get: (l: Lead) => l.contactSource ?? l.source },
  { key: "utm_source", label: "UTM source", get: (l: Lead) => l.attribution.utmSource },
  { key: "utm_medium", label: "UTM medium", get: (l: Lead) => l.attribution.utmMedium },
  { key: "utm_campaign", label: "UTM campaign", get: (l: Lead) => l.attribution.utmCampaign ?? l.attribution.campaign },
  { key: "utm_content", label: "UTM content", get: (l: Lead) => l.attribution.utmContent },
  { key: "channel", label: "Channel", get: (l: Lead) => l.attribution.sessionSource ?? l.attribution.medium },
  { key: "form", label: "Lead form", get: (l: Lead) => l.source },
] as const;

export type SourceDimension = (typeof SOURCE_DIMENSIONS)[number]["key"];

/** What Overview → Lead sources groups by when no ?by= is given. */
export const DEFAULT_SOURCE_DIMENSION: SourceDimension = "utm_medium";

export const NOT_SET = "(not set)";

export interface SourceRow {
  label: string;
  leads: number;
  /** Leads with at least one appointment that wasn't cancelled or invalid. */
  booked: number;
  won: number;
  lost: number;
  bookedRate: number | null;
}

export function isLostLead(l: Lead, stageName: string | undefined) {
  return l.status === "lost" || l.status === "abandoned" || (!!stageName && isLostLikeStage(stageName));
}

/**
 * Lead outcomes grouped by one attribution dimension. The caller passes the
 * cohort (e.g. leads created in the selected range); outcomes are as of now.
 * Sorted by lead count, with "(not set)" last.
 */
export function sourceBreakdown(leads: Lead[], appointments: Appointment[], stages: PipelineStage[], dimension: SourceDimension): SourceRow[] {
  const dim = SOURCE_DIMENSIONS.find((d) => d.key === dimension) ?? SOURCE_DIMENSIONS[0];
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const bookedLeads = new Set(appointments.filter((a) => a.leadId && a.ghlStatus !== "cancelled" && a.ghlStatus !== "invalid").map((a) => a.leadId!));
  const rows = new Map<string, SourceRow>();
  for (const l of leads) {
    const label = dim.get(l)?.trim() || NOT_SET;
    const r = rows.get(label) ?? { label, leads: 0, booked: 0, won: 0, lost: 0, bookedRate: null };
    r.leads++;
    if (bookedLeads.has(l.id)) r.booked++;
    if (l.status === "won") r.won++;
    else if (isLostLead(l, l.stageId ? stageName.get(l.stageId) : undefined)) r.lost++;
    rows.set(label, r);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, bookedRate: r.leads ? r.booked / r.leads : null }))
    .sort((a, b) => Number(a.label === NOT_SET) - Number(b.label === NOT_SET) || b.leads - a.leads || a.label.localeCompare(b.label));
}

/** Share of leads that have any value for the dimension (to say when UTMs aren't being captured). */
export function coverage(leads: Lead[], dimension: SourceDimension) {
  const dim = SOURCE_DIMENSIONS.find((d) => d.key === dimension) ?? SOURCE_DIMENSIONS[0];
  return leads.length ? leads.filter((l) => !!dim.get(l)?.trim()).length / leads.length : null;
}
