import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { clientForAccount, type AccountRow } from "../ghl/auth";
import { GhlApiError } from "../ghl/client";
import {
  getContact,
  getLocation,
  iterateOpportunities,
  iterateTransactions,
  listCalendarEvents,
  listCalendars,
  listPipelines,
  listUsers,
} from "../ghl/endpoints";
import { personKey, toIso } from "./mappers";
import { isMissingColumn, loadRefs, logSync, upsertAppointment, upsertContact, upsertOpportunity } from "./store";

/**
 * Scheduled reconciliation for one account. Re-reads GHL (read-only) and
 * upserts everything, which (a) recovers webhook events that never arrived
 * and (b) corrects drift. Idempotent: running it twice changes nothing.
 * Stage changes discovered here are recorded as `reconcile_diff`.
 */
export async function reconcileAccount(db: SupabaseClient, account: AccountRow, kind: "reconcile" | "manual" | "full" = "reconcile") {
  const { data: run } = await db.from("sync_runs").insert({ account_id: account.id, kind }).select("id").single();
  const runId = run?.id as string | undefined;
  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);
  const warnings: string[] = [];
  await db.from("ghl_accounts").update({ last_sync_started_at: new Date().toISOString() }).eq("id", account.id);
  const ghl = clientForAccount(account);
  const nowIso = new Date().toISOString();

  try {
    // 1. Location: timezone + companyId (needed for the users endpoint).
    const loc = await getLocation(ghl);
    if (loc.id && loc.id !== account.location_id) throw new Error(`Token belongs to location ${loc.id}, expected ${account.location_id}`);
    await db.from("ghl_accounts").update({ timezone: loc.timezone ?? null, company_id: loc.companyId ?? account.company_id }).eq("id", account.id);

    // 2. Users → sales reps.
    const companyId = loc.companyId ?? account.company_id;
    if (companyId) {
      try {
        const users = await listUsers(ghl, companyId);
        for (const u of users) {
          const name = u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;
          await db.from("sales_reps").upsert(
            { account_id: account.id, ghl_user_id: u.id, name, email: u.email ?? null, person_key: personKey(u.email, account.id, u.id), active: !u.deleted, updated_at: nowIso },
            { onConflict: "account_id,ghl_user_id" },
          );
        }
        bump("users", users.length);
      } catch (err) {
        warnings.push(`users: ${(err as Error).message}`);
      }
    } else warnings.push("users: location has no companyId; skipped");

    // 3. Pipelines and stages (mappings are preserved on upsert).
    const pipelines = await listPipelines(ghl);
    for (const p of pipelines) {
      const { data: pr, error } = await db
        .from("pipelines")
        .upsert({ account_id: account.id, ghl_pipeline_id: p.id, name: p.name, updated_at: nowIso }, { onConflict: "account_id,ghl_pipeline_id" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      for (const [i, s] of (p.stages ?? []).entries()) {
        await db
          .from("pipeline_stages")
          .upsert(
            { account_id: account.id, pipeline_id: pr.id, ghl_stage_id: s.id, name: s.name, position: s.position ?? i, updated_at: nowIso },
            { onConflict: "account_id,ghl_stage_id" },
          );
      }
    }
    bump("pipelines", pipelines.length);

    // 4. Calendars.
    const calendars = await listCalendars(ghl);
    for (const c of calendars) {
      await db.from("calendars").upsert({ account_id: account.id, ghl_calendar_id: c.id, name: c.name, updated_at: nowIso }, { onConflict: "account_id,ghl_calendar_id" });
    }
    bump("calendars", calendars.length);

    const refs = await loadRefs(db, account.id);

    // 5. Opportunities in pipelines marked as sales pipelines (all pipelines if none marked yet).
    const { data: salesPipes } = await db.from("pipelines").select("ghl_pipeline_id").eq("account_id", account.id).eq("is_sales_pipeline", true);
    const targets = salesPipes?.length ? salesPipes.map((p) => p.ghl_pipeline_id as string) : [undefined];
    const seenContacts = new Set<string>();
    for (const pipelineId of targets) {
      for await (const page of iterateOpportunities(ghl, pipelineId)) {
        for (const opp of page) {
          const r = await upsertOpportunity(db, refs, opp, "reconcile", nowIso);
          bump(`opportunities_${r}`);
          const cid = opp.contactId ?? opp.contact?.id;
          if (cid) seenContacts.add(cid);
        }
      }
    }

    // 6. Contacts referenced by opportunities that we have never fully fetched
    //    (including, once, older contacts fetched before attribution was stored).
    if (seenContacts.size) {
      let known = await db.from("contacts").select("ghl_contact_id").eq("account_id", account.id).not("date_added", "is", null).not("attribution_fetched_at", "is", null);
      // Attribution migration not applied yet: fall back to the original rule so we don't refetch every run.
      if (isMissingColumn(known.error)) known = await db.from("contacts").select("ghl_contact_id").eq("account_id", account.id).not("date_added", "is", null);
      const have = new Set((known.data ?? []).map((k) => k.ghl_contact_id));
      const missing = [...seenContacts].filter((c) => !have.has(c)).slice(0, 500);
      for (const id of missing) {
        try {
          const c = await getContact(ghl, id);
          if (c) bump(`contacts_${await upsertContact(db, account.id, c, { fullFetch: true })}`);
        } catch (err) {
          if (!(err instanceof GhlApiError && err.status === 404)) warnings.push(`contact ${id}: ${(err as Error).message}`);
        }
      }
    }

    // 7. Appointments for sales calendars (all calendars if none marked yet).
    const { data: cals } = await db.from("calendars").select("ghl_calendar_id, is_sales_calendar").eq("account_id", account.id);
    const salesCals = (cals ?? []).filter((c) => c.is_sales_calendar);
    const calTargets = (salesCals.length ? salesCals : cals ?? []).map((c) => c.ghl_calendar_id as string);
    const start = Date.now() - account.appointment_lookback_days * 86_400_000;
    const end = Date.now() + account.appointment_lookahead_days * 86_400_000;
    for (const calId of calTargets) {
      const events = await listCalendarEvents(ghl, calId, start, end);
      for (const e of events) bump(`appointments_${await upsertAppointment(db, refs, e)}`);
    }

    // 8. Optional: collected revenue from GHL payments (succeeded transactions only).
    if (env.ghlSyncPayments()) {
      try {
        for await (const page of iterateTransactions(ghl, new Date(Date.now() - 365 * 86_400_000).toISOString())) {
          for (const t of page) {
            if (t.status !== "succeeded" || t.liveMode === false) continue;
            const amount = Number(t.amount ?? 0) - Number(t.amountRefunded ?? 0);
            if (!(amount > 0)) continue;
            await db.from("revenue_receipts").upsert(
              { account_id: account.id, ghl_transaction_id: t._id, ghl_contact_id: t.contactId ?? null, amount, currency: t.currency ?? null, received_at: toIso(t.createdAt) ?? nowIso, source: "ghl_payments" },
              { onConflict: "account_id,ghl_transaction_id" },
            );
            bump("receipts");
          }
        }
      } catch (err) {
        warnings.push(`payments: ${(err as Error).message}`);
      }
    }

    bump("api_requests", ghl.requestCount());
    const status = warnings.length ? "partial" : "succeeded";
    await db.from("sync_runs").update({ status, finished_at: new Date().toISOString(), counts, error: warnings.join("\n") || null }).eq("id", runId);
    await db
      .from("ghl_accounts")
      .update({
        last_successful_sync_at: new Date().toISOString(),
        connection_status: "connected",
        ...(warnings.length ? { last_error: warnings[0].slice(0, 500), last_error_at: new Date().toISOString() } : { last_error: null }),
      })
      .eq("id", account.id);
    for (const w of warnings) await logSync(db, { run_id: runId, account_id: account.id, level: "warn", message: w });
    return { status, counts, warnings };
  } catch (err) {
    const message = (err as Error).message;
    const auth = err instanceof GhlApiError && err.isAuthError;
    await db.from("sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), counts, error: message }).eq("id", runId);
    await db
      .from("ghl_accounts")
      .update({ connection_status: auth ? "error" : undefined, last_error: message.slice(0, 500), last_error_at: new Date().toISOString() })
      .eq("id", account.id);
    await logSync(db, { run_id: runId, account_id: account.id, level: "error", message, context: { counts } });
    return { status: "failed" as const, counts, warnings: [message] };
  }
}

export async function reconcileAll(db: SupabaseClient, deadlineMs: number) {
  const { data: accounts } = await db.from("ghl_accounts").select("*").eq("active", true).order("last_successful_sync_at", { ascending: true, nullsFirst: true });
  const results: Array<{ account: string; status: string }> = [];
  for (const a of (accounts ?? []) as AccountRow[]) {
    if (Date.now() > deadlineMs) {
      results.push({ account: a.name, status: "deferred (time budget)" });
      continue;
    }
    if (a.auth_type === "oauth" && a.connection_status === "not_connected") {
      results.push({ account: a.name, status: "skipped (not connected)" });
      continue;
    }
    const r = await reconcileAccount(db, a);
    results.push({ account: a.name, status: r.status });
  }
  return results;
}
