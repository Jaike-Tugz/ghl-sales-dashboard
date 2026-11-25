import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GhlCalendarEvent, GhlContact, GhlOpportunity } from "../ghl/endpoints";
import {
  closeDates,
  isStale,
  mapAppointment,
  mapContact,
  mapContactAttribution,
  mapOpportunity,
  planReschedule,
  planTransition,
  type AccountRefs,
  type ExistingAppointment,
  type ExistingOpportunity,
} from "./mappers";

export async function loadRefs(db: SupabaseClient, accountId: string): Promise<AccountRefs> {
  const [p, s, r, c] = await Promise.all([
    db.from("pipelines").select("id, ghl_pipeline_id").eq("account_id", accountId),
    db.from("pipeline_stages").select("id, ghl_stage_id, business_stage").eq("account_id", accountId),
    db.from("sales_reps").select("id, ghl_user_id").eq("account_id", accountId),
    db.from("calendars").select("id, ghl_calendar_id").eq("account_id", accountId),
  ]);
  for (const res of [p, s, r, c]) if (res.error) throw new Error(res.error.message);
  return {
    accountId,
    pipelines: new Map((p.data ?? []).map((x) => [x.ghl_pipeline_id, x.id])),
    stages: new Map((s.data ?? []).map((x) => [x.ghl_stage_id, { id: x.id, businessStage: x.business_stage }])),
    reps: new Map((r.data ?? []).map((x) => [x.ghl_user_id, x.id])),
    calendars: new Map((c.data ?? []).map((x) => [x.ghl_calendar_id, x.id])),
  };
}

export type UpsertResult = "inserted" | "updated" | "stale" | "unchanged";

/**
 * Idempotent opportunity upsert keyed on (account_id, ghl_opportunity_id).
 * Re-delivered or out-of-order events never duplicate or regress a record.
 */
export async function upsertOpportunity(
  db: SupabaseClient,
  refs: AccountRefs,
  opp: GhlOpportunity,
  origin: "webhook" | "reconcile",
  eventAt: string,
  isCreateEvent = false,
): Promise<UpsertResult> {
  const row = mapOpportunity(opp, refs);
  const { data: existing, error: selErr } = await db
    .from("opportunities")
    .select("id, ghl_stage_id, status, won_at, lost_at, ghl_updated_at")
    .eq("account_id", refs.accountId)
    .eq("ghl_opportunity_id", row.ghl_opportunity_id)
    .maybeSingle<ExistingOpportunity>();
  if (selErr) throw new Error(selErr.message);
  if (existing && isStale(existing.ghl_updated_at, row.ghl_updated_at)) return "stale";

  const dates = closeDates(existing, row, eventAt);
  const transition = planTransition(existing, row, origin, eventAt, isCreateEvent);
  const { data: saved, error } = await db
    .from("opportunities")
    .upsert({ ...row, ...dates, synced_at: new Date().toISOString() }, { onConflict: "account_id,ghl_opportunity_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (transition) {
    const stage = (k: string | null) => (k ? refs.stages.get(k)?.businessStage ?? null : null);
    const { error: tErr } = await db.from("stage_transitions").upsert(
      {
        account_id: refs.accountId,
        opportunity_id: saved.id,
        ...transition,
        from_business_stage: stage(transition.from_ghl_stage_id),
        to_business_stage: stage(transition.to_ghl_stage_id),
      },
      { onConflict: "opportunity_id,to_ghl_stage_id,entered_at", ignoreDuplicates: true },
    );
    if (tErr) throw new Error(tErr.message);
  }

  // Pull the embedded contact summary (search results include it) without overwriting richer data.
  if (opp.contact?.id) {
    await db.from("contacts").upsert(
      {
        account_id: refs.accountId,
        ghl_contact_id: opp.contact.id,
        full_name: opp.contact.name ?? null,
        company_name: opp.contact.companyName ?? null,
        email: opp.contact.email ?? null,
        phone: opp.contact.phone ?? null,
      },
      { onConflict: "account_id,ghl_contact_id", ignoreDuplicates: true },
    );
  }
  return existing ? "updated" : "inserted";
}

/** True when Postgres/PostgREST says a column is missing (attribution migration not applied yet). */
export const isMissingColumn = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|Could not find the '.*' column/i.test(e.message ?? ""));

/**
 * `fullFetch` = the payload came from GET /contacts/{id}, which carries
 * attribution; it stamps attribution_fetched_at so the backfill runs once.
 */
export async function upsertContact(db: SupabaseClient, accountId: string, c: GhlContact, opts: { fullFetch?: boolean } = {}): Promise<UpsertResult> {
  const base = mapContact(c, accountId);
  const attribution = mapContactAttribution(c);
  const row = {
    ...base,
    ...(attribution ?? {}),
    ...(opts.fullFetch ? { attribution_fetched_at: new Date().toISOString() } : {}),
  };
  const { data: existing } = await db
    .from("contacts")
    .select("id, ghl_updated_at")
    .eq("account_id", accountId)
    .eq("ghl_contact_id", c.id)
    .maybeSingle();
  if (existing && isStale(existing.ghl_updated_at, row.ghl_updated_at)) return "stale";
  const synced_at = new Date().toISOString();
  let { error } = await db.from("contacts").upsert({ ...row, synced_at }, { onConflict: "account_id,ghl_contact_id" });
  if (isMissingColumn(error)) ({ error } = await db.from("contacts").upsert({ ...base, synced_at }, { onConflict: "account_id,ghl_contact_id" }));
  if (error) throw new Error(error.message);
  return existing ? "updated" : "inserted";
}

/** Link an appointment to the contact's most recent opportunity created on/before the start. */
async function findOpportunityForContact(db: SupabaseClient, accountId: string, contactId: string | null, start: string) {
  if (!contactId) return null;
  const { data } = await db
    .from("opportunities")
    .select("id, ghl_created_at")
    .eq("account_id", accountId)
    .eq("ghl_contact_id", contactId)
    .is("deleted_at", null)
    .order("ghl_created_at", { ascending: false });
  if (!data?.length) return null;
  const before = data.find((o) => o.ghl_created_at && o.ghl_created_at <= start);
  return (before ?? data[data.length - 1]).id as string;
}

export async function upsertAppointment(db: SupabaseClient, refs: AccountRefs, e: GhlCalendarEvent): Promise<UpsertResult> {
  const row = mapAppointment(e, refs);
  if (!row) return "unchanged";
  const { data: existing } = await db
    .from("appointments")
    .select("id, start_time, original_start_time, reschedule_count, ghl_updated_at")
    .eq("account_id", refs.accountId)
    .eq("ghl_appointment_id", row.ghl_appointment_id)
    .maybeSingle<ExistingAppointment>();
  if (existing && isStale(existing.ghl_updated_at, row.ghl_updated_at)) return "stale";
  const resched = planReschedule(existing, row.start_time, row.ghl_status);
  const opportunity_id = await findOpportunityForContact(db, refs.accountId, row.ghl_contact_id, row.start_time);
  const { error } = await db
    .from("appointments")
    .upsert({ ...row, ...resched, opportunity_id, synced_at: new Date().toISOString() }, { onConflict: "account_id,ghl_appointment_id" });
  if (error) throw new Error(error.message);
  return existing ? "updated" : "inserted";
}

export async function markDeleted(db: SupabaseClient, table: "opportunities" | "contacts" | "appointments", accountId: string, column: string, ghlId: string) {
  const { error } = await db.from(table).update({ deleted_at: new Date().toISOString() }).eq("account_id", accountId).eq(column, ghlId);
  if (error) throw new Error(error.message);
}

export async function logSync(
  db: SupabaseClient,
  entry: { run_id?: string | null; account_id?: string | null; level: "info" | "warn" | "error"; message: string; context?: unknown },
) {
  await db.from("sync_logs").insert({ ...entry, context: entry.context ?? null });
}
