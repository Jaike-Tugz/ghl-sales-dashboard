import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Admin-only: start the official GHL OAuth (chooselocation) flow for one account. */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin" || viewer.isDemo) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const clientId = env.ghlClientId();
  if (!clientId || !env.ghlClientSecret()) return NextResponse.redirect(new URL("/integrations?oauth_error=GHL_CLIENT_ID%2FSECRET%20not%20configured", req.url));
  const accountId = req.nextUrl.searchParams.get("account");
  if (!accountId) return NextResponse.json({ error: "account required" }, { status: 400 });

  const state = randomBytes(24).toString("base64url");
  const db = createAdminClient();
  const { error } = await db.from("oauth_states").insert({ state, account_id: accountId, created_by: viewer.userId, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const authorize = new URL("https://marketplace.gohighlevel.com/v2/oauth/chooselocation");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", `${env.appUrl()}/api/ghl/oauth/callback`);
  authorize.searchParams.set("scope", env.ghlOauthScopes());
  authorize.searchParams.set("state", state);
  return NextResponse.redirect(authorize);
}
