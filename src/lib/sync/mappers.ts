/**
 * Pure mapping/decision functions between GHL payloads and our rows. No I/O
 * here, so idempotency, out-of-order and reschedule rules are unit-tested.
 */
import type { GhlCalendarEvent, GhlContact, GhlOpportunity } from "../ghl/endpoints";

export interface AccountRefs {
  accountId: string;
  pipelines: Map<string, string>; // ghl_pipeline_id → id
  stages: Map<string, { id: string; businessStage: string | null }>; // ghl_stage_id → row
  reps: Map<string, string>; // ghl_user_id → sales_reps.id
  calendars: Map<string, string>; // ghl_calendar_id → id
}

const VALID_STATUS = new Set(["open", "won", "lost", "abandoned"]);
const VALID_APPT_STATUS = new Set(["new", "confirmed", "cancelled", "showed", "noshow", "invalid"]);

export const toIso = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

export interface OpportunityRow {
  account_id: string;
  ghl_opportunity_id: string;
  ghl_contact_id: string | null;
  name: string | null;
  ghl_pipeline_id: string | null;
  pipeline_id: string | null;
  ghl_stage_id: string | null;
  stage_id: string | null;
  status: "open" | "won" | "lost" | "abandoned";
  monetary_value: number;
  source: string | null;
  assigned_ghl_user_id: string | null;
  rep_id: string | null;
  ghl_created_at: string | null;
  last_stage_change_at: string | null;
  last_status_change_at: string | null;
  last_activity_at: string | null;
  ghl_updated_at: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  deleted_at: null;
}

export function mapOpportunity(opp: GhlOpportunity & { dateAdded?: string }, refs: AccountRefs): OpportunityRow {
  const status = VALID_STATUS.has(String(opp.status)) ? (opp.status as OpportunityRow["status"]) : "open";
  return {
    account_id: refs.accountId,
    ghl_opportunity_id: opp.id,
    ghl_contact_id: opp.contactId ?? opp.contact?.id ?? null,
    name: opp.name ?? null,
    ghl_pipeline_id: opp.pipelineId ?? null,
    pipeline_id: opp.pipelineId ? refs.pipelines.get(opp.pipelineId) ?? null : null,
    ghl_stage_id: opp.pipelineStageId ?? null,
    stage_id: opp.pipelineStageId ? refs.stages.get(opp.pipelineStageId)?.id ?? null : null,
    status,
    monetary_value: Number.isFinite(Number(opp.monetaryValue)) ? Number(opp.monetaryValue) : 0,
    source: opp.source || null,
    assigned_ghl_user_id: opp.assignedTo || null,
    rep_id: opp.assignedTo ? refs.reps.get(opp.assignedTo) ?? null : null,
    ghl_created_at: toIso(opp.createdAt ?? opp.dateAdded),
    last_stage_change_at: toIso(opp.lastStageChangeAt),
    last_status_change_at: toIso(opp.lastStatusChangeAt),
    last_activity_at: toIso(opp.lastActionDate),
    ghl_updated_at: toIso(opp.updatedAt),
    deleted_at: null,
  };
}

export interface ExistingOpportunity {
  id: string;
  ghl_stage_id: string | null;
  status: string;
  won_at: string | null;
  lost_at: string | null;
  ghl_updated_at: string | null;
}

/** True when the incoming record is older than what we already hold (out-of-order delivery). */
export function isStale(existingUpdatedAt: string | null | undefined, incomingUpdatedAt: string | null | undefined): boolean {
  if (!existingUpdatedAt || !incomingUpdatedAt) return false;
  return Date.parse(incomingUpdatedAt) < Date.parse(existingUpdatedAt);
}

/**
 * Decide won_at / lost_at. The close date is captured once, when we first see
 * the status change, from GHL's lastStatusChangeAt if available, else the
 * event time. Re-opening clears it.
 */
export function closeDates(existing: ExistingOpportunity | null, row: OpportunityRow, eventAt: string): { won_at: string | null; lost_at: string | null } {
  const when = row.last_status_change_at ?? row.ghl_updated_at ?? eventAt;
  const won = row.status === "won" ? (existing?.status === "won" && existing.won_at ? existing.won_at : when) : null;
  const closedLost = row.status === "lost" || row.status === "abandoned";
  const lost = closedLost ? (existing && (existing.status === "lost" || existing.status === "abandoned") && existing.lost_at ? existing.lost_at : when) : null;
  return { won_at: won, lost_at: lost };
}

export interface PlannedTransition {
  from_ghl_stage_id: string | null;
  to_ghl_stage_id: string | null;
  entered_at: string;
  source: "webhook" | "reconcile_diff" | "snapshot";
}

/**
 * Record a stage transition only when the stage actually changes. The first
 * time we ever see an opportunity via reconciliation we can't know its
 * history, so we write one "snapshot" entry (reconstructed, labelled as such).
 */
export function planTransition(
  existing: ExistingOpportunity | null,
  row: OpportunityRow,
  origin: "webhook" | "reconcile",
  eventAt: string,
  isCreateEvent = false,
): PlannedTransition | null {
  if (!row.ghl_stage_id) return null;
  if (!existing) {
    const observed = origin === "webhook" && isCreateEvent;
    return {
      from_ghl_stage_id: null,
      to_ghl_stage_id: row.ghl_stage_id,
      entered_at: (observed ? row.ghl_created_at : row.last_stage_change_at ?? row.ghl_created_at) ?? eventAt,
      source: observed ? "webhook" : "snapshot",
    };
  }
  if (existing.ghl_stage_id === row.ghl_stage_id) return null;
  return {
    from_ghl_stage_id: existing.ghl_stage_id,
    to_ghl_stage_id: row.ghl_stage_id,
    entered_at: row.last_stage_change_at ?? eventAt,
    source: origin === "webhook" ? "webhook" : "reconcile_diff",
  };
}

export function mapContact(c: GhlContact & { locationId?: string }, accountId: string) {
  const full = c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || null;
  return {
    account_id: accountId,
    ghl_contact_id: c.id,
    first_name: c.firstName ?? null,
    last_name: c.lastName ?? null,
    full_name: full,
    company_name: c.companyName ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    source: c.source ?? null,
    assigned_ghl_user_id: c.assignedTo ?? null,
    date_added: toIso(c.dateAdded),
    ghl_updated_at: toIso(c.dateUpdated),
    deleted_at: null,
  };
}

export interface ExistingAppointment {
  id: string;
  start_time: string;
  original_start_time: string | null;
  reschedule_count: number;
  ghl_updated_at: string | null;
}

export function mapAppointment(e: GhlCalendarEvent, refs: AccountRefs) {
  const start = toIso(e.startTime);
  if (!start) return null;
  const status = VALID_APPT_STATUS.has(String(e.appointmentStatus)) ? String(e.appointmentStatus) : "new";
  return {
    account_id: refs.accountId,
    ghl_appointment_id: e.id,
    ghl_calendar_id: e.calendarId ?? null,
    calendar_id: e.calendarId ? refs.calendars.get(e.calendarId) ?? null : null,
    ghl_contact_id: e.contactId ?? null,
    assigned_ghl_user_id: e.assignedUserId ?? null,
    rep_id: e.assignedUserId ? refs.reps.get(e.assignedUserId) ?? null : null,
    title: e.title ?? null,
    ghl_status: status,
    start_time: start,
    end_time: toIso(e.endTime),
    booked_at: toIso(e.dateAdded),
    ghl_updated_at: toIso(e.dateUpdated),
    deleted_at: null,
  };
}

/** A moved start time on a still-live appointment counts as one reschedule. */
export function planReschedule(existing: ExistingAppointment | null, newStart: string, status: string) {
  if (!existing) return { original_start_time: newStart, reschedule_count: 0 };
  const moved = Date.parse(existing.start_time) !== Date.parse(newStart);
  const live = status !== "cancelled" && status !== "invalid";
  return {
    original_start_time: existing.original_start_time ?? existing.start_time,
    reschedule_count: existing.reschedule_count + (moved && live ? 1 : 0),
  };
}

export function personKey(email: string | null | undefined, accountId: string, ghlUserId: string): string {
  return email ? email.trim().toLowerCase() : `${accountId}:${ghlUserId}`;
}
