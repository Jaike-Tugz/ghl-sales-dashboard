import { NextResponse, type NextRequest } from "next/server";
import { isAuthorisedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { retryFailedEvents } from "@/lib/sync/process-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ retried: await retryFailedEvents(createAdminClient(), 200) });
}
