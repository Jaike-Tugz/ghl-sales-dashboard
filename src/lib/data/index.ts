import "server-only";
import { cache } from "react";
import { env } from "../env";
import { defaultSettings } from "../settings-defaults";
import { createUserClient } from "../supabase/server";
import type {
  AppSettings,
  Appointment,
  BusinessStageKey,
  CallOutcome,
  Dataset,
  GhlAppointmentStatus,
  Lead,
  StageTransition,
  Viewer,
} from "../types";
import { getMockDataset } from "./mock";

export const isDemoMode = () => env.dataSource() === "mock";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
let demoSettings: AppSettings | null = null;

export const getSettings = cache(async (): Promise<AppSettings> => {
  const base = defaultSettings();
  if (isDemoMode()) return demoSettings ?? base;
  const db = await createUserClient();
  const [{ data: s }, { data: rules }] = await Promise.all([
    db.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("follow_up_rules").select("key, label, enabled, threshold_days"),
  ]);
  return {
    reportingTimezone: s?.reporting_timezone || base.reportingTimezone,
    funnelStages: Array.isArray(s?.funnel_stages) && s.funnel_stages.length ? s.funnel_stages : base.funnelStages,
    outcomeMapping: { ...base.outcomeMapping, ...(s?.outcome_mapping ?? {}) },
    abandonedCountsAsLost: s?.abandoned_counts_as_lost ?? base.abandonedCountsAsLost,
    pendingOutcomeGraceMinutes: s?.pending_outcome_grace_minutes ?? base.pendingOutcomeGraceMinutes,
    followUpRules: base.followUpRules.map((r) => {
      const row = rules?.find((x) => x.key === r.key);
      return row ? { ...r, enabled: row.enabled, thresholdDays: row.threshold_days } : r;
    }),
  };
});

export function setDemoSettings(s: AppSettings) {
  demoSettings = s;
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

/** Demo mode mirrors the RLS rules so personas see exactly what they would in production. */
function scopeForViewer(ds: Dataset, v: Viewer): Dataset {
  if (v.role === "admin") return ds;
  const accounts = v.accountIds === "all" ? null : new Set(v.accountIds);
  const inAcc = <T extends { accountId: string }>(rows: T[]) => (accounts ? rows.filter((r) => accounts.has(r.accountId)) : rows);
  let leads = inAcc(ds.leads);
  let appointments = inAcc(ds.appointments);
  if (v.role === "rep") {
    const mine = new Set(v.repIds);
    leads = leads.filter((l) => l.repId && mine.has(l.repId));
    const ids = new Set(leads.map((l) => l.id));
    appointments = appointments.filter((a) => (a.repId && mine.has(a.repId)) || (a.leadId && ids.has(a.leadId)));
  }
  const leadIds = new Set(leads.map((l) => l.id));
  return {
    ...ds,
    accounts: accounts ? ds.accounts.filter((a) => accounts.has(a.id)) : ds.accounts,
    reps: inAcc(ds.reps),
    pipelines: inAcc(ds.pipelines),
    stages: inAcc(ds.stages),
    calendars: inAcc(ds.calendars),
    leads,
    appointments,
    transitions: ds.transitions.filter((t) => leadIds.has(t.leadId)),
    receipts: inAcc(ds.receipts).filter((r) => v.role !== "rep" || (r.leadId && leadIds.has(r.leadId))),
    callActivities: inAcc(ds.callActivities),
  };
}

const demoOverrides = new Map<string, CallOutcome | null>();
export function setDemoOutcome(appointmentId: string, outcome: CallOutcome | null) {
  demoOverrides.set(appointmentId, outcome);
}

export const getDataset = cache(async (viewer: Viewer): Promise<Dataset> => {
  if (isDemoMode()) {
    const ds = getMockDataset();
    const withOverrides = demoOverrides.size
      ? { ...ds, appointments: ds.appointments.map((a) => (demoOverrides.has(a.id) ? { ...a, outcomeOverride: demoOverrides.get(a.id) ?? null } : a)) }
      : ds;
    return scopeForViewer(withOverrides, viewer);
  }
  return loadFromSupabase();
});

async function selectAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const db = await createUserClient();
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select(columns).range(from, from + PAGE - 1).order("id");
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const CONTACT_COLUMNS = "account_id, ghl_contact_id, full_name, company_name, email, source";
const ATTRIBUTION_COLUMNS = "utm_source, utm_medium, utm_campaign, utm_content, utm_term, attribution_medium, session_source, attribution_campaign";

/**
 * Reads go through the user's session, so RLS decides the rows. Business
 * stage is joined at read time from pipeline_stages, so changing a mapping in
 * Integrations re-classifies history immediately.
 */
async function loadFromSupabase(): Promise<Dataset> {
  const notDeleted = (q: any) => q.is("deleted_at", null);
  const [accounts, reps, pipelines, stages, calendars, opps, contacts, appts, transitions, receipts, calls] = await Promise.all([
    selectAll<any>("ghl_accounts", "id, name, location_id, auth_type, connection_status, last_successful_sync_at, webhook_status, last_webhook_at, last_error, last_error_at, timezone, color, active"),
    selectAll<any>("sales_reps", "id, account_id, ghl_user_id, name, email, person_key"),
    selectAll<any>("pipelines", "id, account_id, ghl_pipeline_id, name, is_sales_pipeline"),
    selectAll<any>("pipeline_stages", "id, account_id, pipeline_id, ghl_stage_id, name, position, business_stage"),
    selectAll<any>("calendars", "id, account_id, ghl_calendar_id, name, call_number, is_sales_calendar"),
    selectAll<any>(
      "opportunities",
      "id, account_id, ghl_opportunity_id, ghl_contact_id, name, pipeline_id, stage_id, status, monetary_value, source, rep_id, ghl_created_at, last_stage_change_at, last_status_change_at, won_at, lost_at, last_activity_at, synced_at",
      notDeleted,
    ),
    selectAll<any>("contacts", `${CONTACT_COLUMNS}, ${ATTRIBUTION_COLUMNS}`, notDeleted).catch((err: Error) =>
      // Attribution migration not applied yet: load contacts without it.
      /does not exist|Could not find/i.test(err.message) ? selectAll<any>("contacts", CONTACT_COLUMNS, notDeleted) : Promise.reject(err),
    ),
    selectAll<any>(
      "appointments",
      "id, account_id, ghl_appointment_id, ghl_contact_id, opportunity_id, calendar_id, rep_id, title, ghl_status, start_time, end_time, booked_at, reschedule_count, outcome_override",
      notDeleted,
    ),
    selectAll<any>("stage_transitions", "id, account_id, opportunity_id, from_business_stage, to_business_stage, entered_at, source"),
    selectAll<any>("revenue_receipts", "id, account_id, opportunity_id, ghl_contact_id, amount, received_at, source"),
    selectAll<any>("call_activities", "id, account_id, ghl_message_id, ghl_contact_id, rep_id, direction, call_status, duration_seconds, occurred_at"),
  ]);

  const salesPipelineIds = new Set(pipelines.filter((p) => p.is_sales_pipeline).map((p) => p.id));
  const accountsWithMapping = new Set(pipelines.filter((p) => p.is_sales_pipeline).map((p) => p.account_id));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const contactByKey = new Map(contacts.map((c) => [`${c.account_id}:${c.ghl_contact_id}`, c]));

  const leads: Lead[] = opps
    // A lead is an opportunity in a sales pipeline. Until an account has any
    // pipeline marked, all of its pipelines count (and Integrations warns).
    .filter((o) => !accountsWithMapping.has(o.account_id) || salesPipelineIds.has(o.pipeline_id))
    .map((o) => {
      const c = contactByKey.get(`${o.account_id}:${o.ghl_contact_id}`);
      const stage = o.stage_id ? stageById.get(o.stage_id) : undefined;
      return {
        id: o.id,
        accountId: o.account_id,
        ghlOpportunityId: o.ghl_opportunity_id,
        ghlContactId: o.ghl_contact_id ?? "",
        name: o.name ?? "",
        contactName: c?.full_name ?? o.name ?? "Unknown",
        company: c?.company_name ?? null,
        email: c?.email ?? null,
        source: o.source ?? c?.source ?? null,
        contactSource: c?.source ?? null,
        attribution: {
          utmSource: c?.utm_source ?? null,
          utmMedium: c?.utm_medium ?? null,
          utmCampaign: c?.utm_campaign ?? null,
          utmContent: c?.utm_content ?? null,
          utmTerm: c?.utm_term ?? null,
          medium: c?.attribution_medium ?? null,
          sessionSource: c?.session_source ?? null,
          campaign: c?.attribution_campaign ?? null,
        },
        repId: o.rep_id,
        pipelineId: o.pipeline_id,
        stageId: o.stage_id,
        businessStage: (stage?.business_stage ?? null) as BusinessStageKey | null,
        status: o.status,
        monetaryValue: Number(o.monetary_value) || 0,
        createdAt: o.ghl_created_at ?? o.synced_at,
        lastStageChangeAt: o.last_stage_change_at,
        lastStatusChangeAt: o.last_status_change_at,
        wonAt: o.won_at,
        lostAt: o.lost_at,
        lastActivityAt: o.last_activity_at,
      };
    });
  const leadIds = new Set(leads.map((l) => l.id));

  const appointments: Appointment[] = appts.map((a) => ({
    id: a.id,
    accountId: a.account_id,
    ghlAppointmentId: a.ghl_appointment_id,
    ghlContactId: a.ghl_contact_id,
    leadId: a.opportunity_id && leadIds.has(a.opportunity_id) ? a.opportunity_id : null,
    calendarId: a.calendar_id,
    repId: a.rep_id,
    title: a.title,
    ghlStatus: a.ghl_status as GhlAppointmentStatus,
    startTime: a.start_time,
    endTime: a.end_time,
    bookedAt: a.booked_at,
    rescheduleCount: a.reschedule_count ?? 0,
    outcomeOverride: a.outcome_override,
  }));

  const observed = transitions.filter((t) => t.source !== "snapshot").map((t) => t.entered_at as string).sort();
  const wonByContact = new Map<string, string>();
  for (const l of leads) if (l.status === "won") wonByContact.set(`${l.accountId}:${l.ghlContactId}`, l.id);

  return {
    accounts: accounts.filter((a) => a.active).map((a) => ({
      id: a.id,
      name: a.name,
      locationId: a.location_id,
      authType: a.auth_type,
      connectionStatus: a.connection_status,
      lastSuccessfulSyncAt: a.last_successful_sync_at,
      webhookStatus: a.webhook_status,
      lastWebhookAt: a.last_webhook_at,
      lastError: a.last_error,
      lastErrorAt: a.last_error_at,
      timezone: a.timezone,
      color: a.color,
    })),
    reps: reps.map((r) => ({ id: r.id, accountId: r.account_id, ghlUserId: r.ghl_user_id, name: r.name, email: r.email, personKey: r.person_key })),
    pipelines: pipelines.map((p) => ({ id: p.id, accountId: p.account_id, ghlPipelineId: p.ghl_pipeline_id, name: p.name, isSalesPipeline: p.is_sales_pipeline })),
    stages: stages.map((s) => ({ id: s.id, accountId: s.account_id, pipelineId: s.pipeline_id, ghlStageId: s.ghl_stage_id, name: s.name, position: s.position, businessStage: s.business_stage })),
    calendars: calendars.map((c) => ({ id: c.id, accountId: c.account_id, ghlCalendarId: c.ghl_calendar_id, name: c.name, callNumber: c.call_number, isSalesCalendar: c.is_sales_calendar })),
    leads,
    appointments,
    transitions: transitions
      .filter((t) => leadIds.has(t.opportunity_id))
      .map(
        (t): StageTransition => ({
          id: t.id,
          accountId: t.account_id,
          leadId: t.opportunity_id,
          fromStageKey: t.from_business_stage,
          toStageKey: t.to_business_stage,
          enteredAt: t.entered_at,
          source: t.source,
        }),
      ),
    receipts: receipts.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      // GHL transactions reference a contact, not an opportunity: attribute to that contact's won lead.
      leadId: r.opportunity_id ?? (r.ghl_contact_id ? wonByContact.get(`${r.account_id}:${r.ghl_contact_id}`) ?? null : null),
      ghlContactId: r.ghl_contact_id,
      amount: Number(r.amount) || 0,
      receivedAt: r.received_at,
      source: r.source,
    })),
    callActivities: calls.map((c) => ({
      id: c.id,
      accountId: c.account_id,
      ghlMessageId: c.ghl_message_id,
      ghlContactId: c.ghl_contact_id,
      leadId: null,
      repId: c.rep_id,
      direction: c.direction,
      callStatus: c.call_status,
      durationSeconds: c.duration_seconds,
      occurredAt: c.occurred_at,
    })),
    historyTrackedSince: observed[0] ?? null,
  };
}
