import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { requestToken, storeTokens } from "@/lib/ghl/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target. Exchanges the code server-side (client secret never
 * leaves the server), checks the token's locationId matches the account the
 * admin started with, then stores tokens AES-256-GCM encrypted.
 */
export async function GET(req: NextRequest) {
  const fail = (m: string) => NextResponse.redirect(new URL(`/integrations?oauth_error=${encodeURIComponent(m)}`, req.url));
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin") return fail("Sign in as an admin first");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return fail("Missing code or state");

  const db = createAdminClient();
  const { data: st } = await db.from("oauth_states").delete().eq("state", state).select("account_id, created_by, expires_at").maybeSingle();
  if (!st || Date.parse(st.expires_at) < Date.now() || st.created_by !== viewer.userId) return fail("OAuth state invalid or expired — start again");

  const { data: account } = await db.from("ghl_accounts").select("id, name, location_id").eq("id", st.account_id).single();
  if (!account) return fail("Account no longer exists");
  try {
    const token = await requestToken({ grant_type: "authorization_code", code, user_type: "Location", redirect_uri: `${env.appUrl()}/api/ghl/oauth/callback` });
    if (token.locationId && token.locationId !== account.location_id) {
      return fail(`You authorised location ${token.locationId}, but this account is ${account.location_id}`);
    }
    await storeTokens(account.id, token);
    return NextResponse.redirect(new URL(`/integrations?connected=${encodeURIComponent(account.name)}`, req.url));
  } catch (err) {
    return fail((err as Error).message);
  }
}
