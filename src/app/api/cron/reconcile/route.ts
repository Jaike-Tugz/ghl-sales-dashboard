import { NextResponse, type NextRequest } from "next/server";
import { isAuthorisedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileAll } from "@/lib/sync/reconcile";
import { retryFailedEvents } from "@/lib/sync/process-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scheduled API reconciliation for every active account (see vercel.json). */
export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const started = Date.now();
  const results = await reconcileAll(db, started + 240_000);
  const retried = await retryFailedEvents(db, 50);
  await db.from("oauth_states").delete().lt("expires_at", new Date().toISOString());
  return NextResponse.json({ results, retried, ms: Date.now() - started });
}
