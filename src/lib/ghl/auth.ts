import "server-only";
import { decryptSecret, encryptSecret } from "../crypto";
import { env, requireEnv } from "../env";
import { createAdminClient } from "../supabase/admin";
import { createGhlClient, GHL_API_BASE, type GhlClient } from "./client";

export interface AccountRow {
  id: string;
  name: string;
  location_id: string;
  company_id: string | null;
  auth_type: "oauth" | "private_integration";
  credential_env_var: string | null;
  timezone: string | null;
  active: boolean;
  connection_status: string;
  appointment_lookback_days: number;
  appointment_lookahead_days: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  userType?: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
}

/**
 * POST /oauth/token (official, form-encoded). The only POST this app makes to
 * GHL, and it changes no CRM data — it exchanges/refreshes our own tokens.
 */
export async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv(env.ghlClientId(), "GHL_CLIENT_ID"),
    client_secret: requireEnv(env.ghlClientSecret(), "GHL_CLIENT_SECRET"),
    ...params,
  });
  const res = await fetch(`${GHL_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { message?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`GHL token request failed (${res.status}): ${json.message ?? json.error ?? "unknown error"}`);
  }
  return json;
}

export async function storeTokens(accountId: string, t: TokenResponse) {
  const db = createAdminClient();
  const { error } = await db.from("ghl_credentials").upsert({
    account_id: accountId,
    access_token_enc: encryptSecret(t.access_token),
    refresh_token_enc: t.refresh_token ? encryptSecret(t.refresh_token) : null,
    expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
    scopes: t.scope ?? null,
    user_type: t.userType ?? null,
    ghl_user_id: t.userId ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not store credentials: ${error.message}`);
  await db
    .from("ghl_accounts")
    .update({
      connection_status: "connected",
      granted_scopes: t.scope ? t.scope.split(" ") : null,
      company_id: t.companyId ?? undefined,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
}

// Serialise refreshes per account within a process (GHL refresh tokens are single-use).
const refreshing = new Map<string, Promise<string>>();

async function refreshAccessToken(account: AccountRow): Promise<string> {
  const pending = refreshing.get(account.id);
  if (pending) return pending;
  const p = (async () => {
    const db = createAdminClient();
    const { data } = await db.from("ghl_credentials").select("refresh_token_enc, user_type").eq("account_id", account.id).single();
    if (!data?.refresh_token_enc) throw new Error("No refresh token stored — reconnect this account");
    try {
      const t = await requestToken({
        grant_type: "refresh_token",
        refresh_token: decryptSecret(data.refresh_token_enc),
        user_type: data.user_type ?? "Location",
      });
      await storeTokens(account.id, t);
      return t.access_token;
    } catch (err) {
      await db
        .from("ghl_accounts")
        .update({ connection_status: "error", last_error: (err as Error).message, last_error_at: new Date().toISOString() })
        .eq("id", account.id);
      throw err;
    }
  })().finally(() => refreshing.delete(account.id));
  refreshing.set(account.id, p);
  return p;
}

async function getAccessToken(account: AccountRow): Promise<string> {
  if (account.auth_type === "private_integration") {
    const token = env.credentialFromEnv(account.credential_env_var);
    if (!token) throw new Error(`Private integration token not found in env var ${account.credential_env_var ?? "(unset)"} (must start with GHL_PIT_)`);
    return token;
  }
  const db = createAdminClient();
  const { data } = await db.from("ghl_credentials").select("access_token_enc, expires_at").eq("account_id", account.id).maybeSingle();
  if (!data) throw new Error("Account is not connected — run the OAuth connection from Integrations");
  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : Infinity;
  if (expiresAt - Date.now() < 5 * 60_000) return refreshAccessToken(account);
  return decryptSecret(data.access_token_enc);
}

export function clientForAccount(account: AccountRow): GhlClient {
  return createGhlClient(
    account.location_id,
    () => getAccessToken(account),
    account.auth_type === "oauth" ? () => refreshAccessToken(account).catch(() => null) : undefined,
  );
}
