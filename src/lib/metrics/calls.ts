import type { AppSettings, Appointment, CallOutcome, Calendar, Dataset, Lead } from "../types";

export interface EnrichedAppointment extends Appointment {
  leadId: string | null;
  callNumber: number | null;
  outcome: CallOutcome;
  isSalesCall: boolean;
  excluded: boolean;
}

const DEFAULT_DURATION_MS = 30 * 60_000;

/**
 * Map a GHL appointment to the dashboard outcome vocabulary.
 *
 *  - A manual override always wins (recorded in the dashboard only).
 *  - showed / noshow / cancelled map through the configurable OutcomeMapping.
 *  - new / confirmed are "scheduled" (or "rescheduled" if the start time has
 *    moved since we first saw it) until their end time + grace has passed,
 *    after which they are "pending outcome" — we never assume a call happened.
 */
export function deriveOutcome(appt: Appointment, settings: AppSettings, now: number): CallOutcome {
  if (appt.outcomeOverride) return appt.outcomeOverride;
  const m = settings.outcomeMapping;
  switch (appt.ghlStatus) {
    case "showed":
      return m.showed;
    case "noshow":
      return m.noshow;
    case "cancelled":
    case "invalid":
      return m.cancelled;
    default: {
      const start = new Date(appt.startTime).getTime();
      const end = appt.endTime ? new Date(appt.endTime).getTime() : start + DEFAULT_DURATION_MS;
      if (now > end + settings.pendingOutcomeGraceMinutes * 60_000) return m.pastUnconfirmed;
      return appt.rescheduleCount > 0 ? "rescheduled" : "scheduled";
    }
  }
}

/**
 * Resolve which lead an appointment belongs to when the sync layer could not
 * (GHL appointments reference a contact, not an opportunity). Picks, within
 * the same account and contact, the most recent lead created on or before the
 * appointment start; otherwise the earliest lead for that contact.
 */
export function resolveLeadId(appt: Appointment, leadsByContact: Map<string, Lead[]>): string | null {
  if (appt.leadId) return appt.leadId;
  if (!appt.ghlContactId) return null;
  const candidates = leadsByContact.get(`${appt.accountId}:${appt.ghlContactId}`);
  if (!candidates?.length) return null;
  const start = new Date(appt.startTime).getTime();
  let best: Lead | null = null;
  for (const l of candidates) {
    if (new Date(l.createdAt).getTime() <= start && (!best || l.createdAt > best.createdAt)) best = l;
  }
  return (best ?? candidates[0]).id;
}

export function indexLeadsByContact(leads: Lead[]): Map<string, Lead[]> {
  const map = new Map<string, Lead[]>();
  for (const l of leads) {
    const key = `${l.accountId}:${l.ghlContactId}`;
    const list = map.get(key);
    if (list) list.push(l);
    else map.set(key, [l]);
  }
  for (const list of map.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return map;
}

/**
 * Enrich appointments with lead, outcome and call number.
 *
 * Call number rule (per lead, sales calendars only, chronological):
 *  - If the calendar is mapped to a call number in Integrations, use it.
 *  - Otherwise the call number is 1 + the number of *completed* earlier calls.
 *    A no-show or cancelled first call followed by a rebooking is therefore
 *    still the first call — rescheduling never inflates the call count.
 */
export function enrichAppointments(ds: Dataset, settings: AppSettings, now: number): EnrichedAppointment[] {
  const calendars = new Map<string, Calendar>(ds.calendars.map((c) => [c.id, c]));
  const byContact = indexLeadsByContact(ds.leads);

  const enriched: EnrichedAppointment[] = ds.appointments.map((a) => {
    const cal = a.calendarId ? calendars.get(a.calendarId) : undefined;
    const excluded = a.ghlStatus === "invalid" && settings.outcomeMapping.excludeInvalid && !a.outcomeOverride;
    return {
      ...a,
      leadId: resolveLeadId(a, byContact),
      outcome: deriveOutcome(a, settings, now),
      // Unmapped calendars (no row) are treated as sales calendars so data is not silently dropped.
      isSalesCall: cal ? cal.isSalesCalendar : true,
      callNumber: null,
      excluded,
    };
  });

  const perLead = new Map<string, EnrichedAppointment[]>();
  for (const a of enriched) {
    if (!a.leadId || !a.isSalesCall || a.excluded) continue;
    const list = perLead.get(a.leadId);
    if (list) list.push(a);
    else perLead.set(a.leadId, [a]);
  }
  for (const list of perLead.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
    let completed = 0;
    for (const a of list) {
      const cal = a.calendarId ? calendars.get(a.calendarId) : undefined;
      a.callNumber = cal?.callNumber ?? completed + 1;
      if (a.outcome === "completed") completed = Math.max(completed, a.callNumber);
    }
  }
  return enriched;
}

export interface LeadCallSummary {
  /** Latest appointment per call number. */
  calls: Map<number, EnrichedAppointment>;
  /** Highest call number with a completed appointment (0 if none). */
  maxCompleted: number;
  completedAt: Map<number, string>;
  nextScheduled: EnrichedAppointment | null;
  lastAppointment: EnrichedAppointment | null;
  all: EnrichedAppointment[];
}

export function summariseByLead(appts: EnrichedAppointment[], now: number): Map<string, LeadCallSummary> {
  const out = new Map<string, LeadCallSummary>();
  const sorted = [...appts].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const a of sorted) {
    if (!a.leadId || a.excluded || !a.isSalesCall) continue;
    let s = out.get(a.leadId);
    if (!s) {
      s = { calls: new Map(), maxCompleted: 0, completedAt: new Map(), nextScheduled: null, lastAppointment: null, all: [] };
      out.set(a.leadId, s);
    }
    s.all.push(a);
    if (a.callNumber != null) s.calls.set(a.callNumber, a);
    if (a.outcome === "completed" && a.callNumber != null) {
      s.maxCompleted = Math.max(s.maxCompleted, a.callNumber);
      if (!s.completedAt.has(a.callNumber)) s.completedAt.set(a.callNumber, a.startTime);
    }
    const t = new Date(a.startTime).getTime();
    if (t <= now) s.lastAppointment = a;
    if (t > now && (a.outcome === "scheduled" || a.outcome === "rescheduled") && !s.nextScheduled) s.nextScheduled = a;
  }
  return out;
}
