import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { dedupeKey, GHL_DOCUMENTED_WEBHOOK_PUBLIC_KEY, HANDLED_EVENTS, isFresh, parseEnvelope, verifyGhlSignature } from "@/lib/ghl/webhook";
import { processStoredEvent, type StoredEvent } from "@/lib/sync/process-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GHL marketplace-app webhook receiver.
 *  1. Verify x-wh-signature (RSA-SHA256, GHL's published key) over the RAW body.
 *  2. Reject stale timestamps (replay protection).
 *  3. Insert into webhook_events with UNIQUE dedupe_key (webhookId) — a
 *     re-delivery hits the constraint and is acknowledged without reprocessing.
 *  4. Process; on failure the row is marked failed and retried by cron.
 * Always 200 for accepted/duplicate events so GHL doesn't hammer retries.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const signature = req.headers.get("x-wh-signature");
  const valid = verifyGhlSignature(raw, signature, env.ghlWebhookPublicKey() ?? GHL_DOCUMENTED_WEBHOOK_PUBLIC_KEY);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let envelope;
  try {
    envelope = parseEnvelope(raw);
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }
  if (!isFresh(envelope, env.ghlWebhookMaxAgeSeconds())) return NextResponse.json({ error: "Stale webhook" }, { status: 400 });

  const db = createAdminClient();
  const { data: account } = envelope.locationId
    ? await db.from("ghl_accounts").select("id").eq("location_id", envelope.locationId).maybeSingle()
    : { data: null };

  const handled = HANDLED_EVENTS.has(envelope.type);
  const { data: inserted, error } = await db
    .from("webhook_events")
    .insert({
      dedupe_key: dedupeKey(envelope, raw),
      account_id: account?.id ?? null,
      location_id: envelope.locationId,
      event_type: envelope.type,
      payload: envelope.payload,
      signature_valid: true,
      status: handled && account ? "received" : "ignored",
      last_error: !account ? "Unknown location" : !handled ? "Event type not used" : null,
    })
    .select("id, event_type, payload, account_id, received_at, attempts")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ status: "duplicate" }); // already received
    console.error("webhook insert failed", error.message);
    return NextResponse.json({ error: "Storage failed" }, { status: 500 }); // let GHL retry
  }
  if (account) {
    await db.from("ghl_accounts").update({ last_webhook_at: new Date().toISOString(), webhook_status: "active" }).eq("id", account.id);
  }
  if (!handled || !account) return NextResponse.json({ status: "ignored" });

  const result = await processStoredEvent(db, inserted as StoredEvent);
  return NextResponse.json({ status: result === "processed" || result === "ignored" ? result : "queued_for_retry" });
}
