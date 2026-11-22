import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, requireEnv } from "../env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — ONLY for webhook ingestion, sync jobs
 * and credential storage on the server. Never pass its results to the browser
 * without scoping them to the viewer first.
 */
export function createAdminClient(): SupabaseClient {
  if (admin) return admin;
  admin = createClient(requireEnv(env.supabaseUrl(), "NEXT_PUBLIC_SUPABASE_URL"), requireEnv(env.supabaseServiceRoleKey(), "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
