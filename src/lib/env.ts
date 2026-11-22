import "server-only";

/**
 * Server-only environment access. Nothing in this module may be imported by a
 * client component — the `server-only` import makes the build fail if it is.
 */

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export const env = {
  supabaseUrl: () => read("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => read("SUPABASE_SERVICE_ROLE_KEY"),
  appUrl: () => read("APP_URL") ?? (read("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${read("VERCEL_PROJECT_PRODUCTION_URL")}` : "http://localhost:3000"),
  ghlClientId: () => read("GHL_CLIENT_ID"),
  ghlClientSecret: () => read("GHL_CLIENT_SECRET"),
  ghlOauthScopes: () =>
    read("GHL_OAUTH_SCOPES") ??
    [
      "locations.readonly",
      "users.readonly",
      "contacts.readonly",
      "opportunities.readonly",
      "calendars.readonly",
      "calendars/events.readonly",
      "conversations/message.readonly",
      "payments/transactions.readonly",
    ].join(" "),
  ghlWebhookPublicKey: () => read("GHL_WEBHOOK_PUBLIC_KEY"),
  ghlWebhookMaxAgeSeconds: () => Number(read("GHL_WEBHOOK_MAX_AGE_SECONDS") ?? 300),
  ghlSyncPayments: () => read("GHL_SYNC_PAYMENTS") === "true",
  credentialsKey: () => read("CREDENTIALS_ENCRYPTION_KEY"),
  cronSecret: () => read("CRON_SECRET"),
  dataSource: (): "mock" | "supabase" => {
    const forced = read("DATA_SOURCE");
    if (forced === "mock" || forced === "supabase") return forced;
    return read("NEXT_PUBLIC_SUPABASE_URL") && read("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "supabase" : "mock";
  },
  /** A private-integration token stored under an admin-chosen env var name. */
  credentialFromEnv: (name: string | null | undefined) => {
    if (!name || !/^[A-Z][A-Z0-9_]{2,63}$/.test(name)) return undefined;
    // Only names with this prefix may be read, so an admin can't point at e.g. SUPABASE_SERVICE_ROLE_KEY.
    if (!name.startsWith("GHL_PIT_")) return undefined;
    return read(name);
  },
};

export function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
