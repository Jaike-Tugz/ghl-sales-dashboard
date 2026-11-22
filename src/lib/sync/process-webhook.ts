import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientForAccount, type AccountRow } from "../ghl/auth";
import { getOpportunity, type GhlCalendarEvent, type GhlContact, type GhlOpportunity } from "../ghl/endpoints";
import { toIso } from "./mappers";
import { loadRefs, markDeleted, upsertAppointment, upsertContact, upsertOpportunity } from "./store";

export interface StoredEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  account_id: string | null;
  received_at: string;
  attempts: number;
}

const MAX_ATTEMPTS = 8;

/**
 * Apply one stored webhook event. Safe to run more than once for the same
 * event: every write is an upsert on the GHL id, with a staleness guard.
 */
export async function applyEvent(db: SupabaseClient, account: AccountRow, ev: StoredEvent): Promise<"processed" | "ignored"> {
  const p = ev.payload;
  const eventAt = toIso(p.timestamp) ?? ev.received_at;
  const refs = await loadRefs(db, account.id);

  switch (ev.event_type) {
    case "ContactCreate":
    case "ContactUpdate":
      await upsertContact(db, account.id, p as unknown as GhlContact);
      return "processed";
    case "ContactDelete":
      await markDeleted(db, "contacts", account.id, "ghl_contact_id", String(p.id));
      return "processed";

    case "OpportunityCreate":
    case "OpportunityUpdate":
    case "OpportunityStageUpdate":
    case "OpportunityStatusUpdate":
    case "OpportunityMonetaryValueUpdate":
    case "OpportunityAssignedToUpdate": {
      // Webhook payloads omit lastStatusChangeAt/lastStageChangeAt, so hydrate
      // from GET /opportunities/{id} for authoritative timestamps; fall back
      // to the payload if the read fails.
      let opp = p as unknown as GhlOpportunity & { dateAdded?: string };
      try {
        const fresh = await getOpportunity(clientForAccount(account), String(p.id));
        if (fresh) opp = { ...opp, ...fresh };
      } catch {
        /* keep payload */
      }
      await upsertOpportunity(db, refs, opp, "webhook", eventAt, ev.event_type === "OpportunityCreate");
      return "processed";
    }
    case "OpportunityDelete":
      await markDeleted(db, "opportunities", account.id, "ghl_opportunity_id", String(p.id));
      return "processed";

    case "AppointmentCreate":
    case "AppointmentUpdate": {
      const appt = p.appointment as GhlCalendarEvent | undefined;
      if (!appt?.id) return "ignored";
      await upsertAppointment(db, refs, appt);
      return "processed";
    }
    case "AppointmentDelete": {
      const appt = p.appointment as GhlCalendarEvent | undefined;
      if (!appt?.id) return "ignored";
      await markDeleted(db, "appointments", account.id, "ghl_appointment_id", appt.id);
      return "processed";
    }

    case "InboundMessage":
    case "OutboundMessage": {
      if (String(p.messageType).toUpperCase() !== "CALL" || !p.messageId) return "ignored";
      const userId = typeof p.userId === "string" ? p.userId : null;
      const { error } = await db.from("call_activities").upsert(
        {
          account_id: account.id,
          ghl_message_id: String(p.messageId),
          ghl_contact_id: typeof p.contactId === "string" ? p.contactId : null,
          ghl_user_id: userId,
          rep_id: userId ? refs.reps.get(userId) ?? null : null,
          direction: p.direction === "inbound" ? "inbound" : "outbound",
          call_status: typeof p.callStatus === "string" ? p.callStatus : null,
          duration_seconds: Number.isFinite(Number(p.callDuration)) ? Number(p.callDuration) : null,
          occurred_at: toIso(p.dateAdded) ?? eventAt,
        },
        { onConflict: "account_id,ghl_message_id" },
      );
      if (error) throw new Error(error.message);
      return "processed";
    }

    case "AppInstall":
    case "INSTALL":
      await db.from("ghl_accounts").update({ webhook_status: "active" }).eq("id", account.id);
      return "processed";
    case "AppUninstall":
    case "UNINSTALL":
      await db.from("ghl_accounts").update({ connection_status: "revoked", webhook_status: "inactive", last_error: "App uninstalled from this sub-account", last_error_at: eventAt }).eq("id", account.id);
      await db.from("ghl_credentials").delete().eq("account_id", account.id);
      return "processed";
    default:
      return "ignored";
  }
}

export async function processStoredEvent(db: SupabaseClient, ev: StoredEvent): Promise<string> {
  if (!ev.account_id) {
    await db.from("webhook_events").update({ status: "ignored", last_error: "Unknown location", processed_at: new Date().toISOString() }).eq("id", ev.id);
    return "ignored";
  }
  const { data: account } = await db.from("ghl_accounts").select("*").eq("id", ev.account_id).single<AccountRow>();
  if (!account) return "ignored";
  try {
    const status = await applyEvent(db, account, ev);
    await db.from("webhook_events").update({ status, attempts: ev.attempts + 1, last_error: null, processed_at: new Date().toISOString() }).eq("id", ev.id);
    return status;
  } catch (err) {
    const attempts = ev.attempts + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    await db
      .from("webhook_events")
      .update({
        status: dead ? "dead" : "failed",
        attempts,
        last_error: (err as Error).message.slice(0, 2000),
        // Exponential retry: 1, 2, 4 … minutes, capped at 6 hours.
        next_attempt_at: dead ? null : new Date(Date.now() + Math.min(360, 2 ** (attempts - 1)) * 60_000).toISOString(),
      })
      .eq("id", ev.id);
    await db.from("ghl_accounts").update({ last_error: `Webhook ${ev.event_type}: ${(err as Error).message}`.slice(0, 500), last_error_at: new Date().toISOString() }).eq("id", account.id);
    return dead ? "dead" : "failed";
  }
}

export async function retryFailedEvents(db: SupabaseClient, limit = 100) {
  const { data } = await db
    .from("webhook_events")
    .select("id, event_type, payload, account_id, received_at, attempts")
    .in("status", ["failed", "received"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .lt("received_at", new Date(Date.now() - 60_000).toISOString())
    .order("received_at", { ascending: true })
    .limit(limit);
  const results: Record<string, number> = {};
  for (const ev of (data ?? []) as StoredEvent[]) {
    const r = await processStoredEvent(db, ev);
    results[r] = (results[r] ?? 0) + 1;
  }
  return results;
}
