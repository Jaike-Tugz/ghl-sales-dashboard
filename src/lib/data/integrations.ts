import "server-only";
import { env } from "../env";
import { createUserClient } from "../supabase/server";
import { getMockDataset } from "./mock";
import { isDemoMode } from ".";

export interface IntegrationAccount {
  id: string;
  name: string;
  locationId: string;
  authType: string;
  credentialEnvVar: string | null;
  credentialPresent: boolean | null;
  connectionStatus: string;
  lastSuccessfulSyncAt: string | null;
  lastSyncStartedAt: string | null;
  webhookStatus: string;
  lastWebhookAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  grantedScopes: string[] | null;
  timezone: string | null;
  color: string;
  active: boolean;
  pipelines: Array<{ id: string; name: string; isSalesPipeline: boolean; stages: Array<{ id: string; name: string; businessStage: string | null }> }>;
  calendars: Array<{ id: string; name: string; callNumber: number | null; isSalesCalendar: boolean }>;
  runs: Array<{ id: string; kind: string; status: string; startedAt: string; finishedAt: string | null; counts: Record<string, number>; error: string | null }>;
}

export interface WebhookEventRow {
  id: string;
  eventType: string;
  locationId: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  receivedAt: string;
}

export async function getIntegrationData(): Promise<{ accounts: IntegrationAccount[]; events: WebhookEventRow[] }> {
  if (isDemoMode()) {
    const ds = getMockDataset();
    return {
      accounts: ds.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        locationId: a.locationId,
        authType: a.authType,
        credentialEnvVar: null,
        credentialPresent: null,
        connectionStatus: a.connectionStatus,
        lastSuccessfulSyncAt: a.lastSuccessfulSyncAt,
        lastSyncStartedAt: a.lastSuccessfulSyncAt,
        webhookStatus: a.webhookStatus,
        lastWebhookAt: a.lastWebhookAt,
        lastError: a.lastError,
        lastErrorAt: a.lastErrorAt,
        grantedScopes: ["(demo)"],
        timezone: a.timezone,
        color: a.color,
        active: true,
        pipelines: ds.pipelines
          .filter((p) => p.accountId === a.id)
          .map((p) => ({ id: p.id, name: p.name, isSalesPipeline: p.isSalesPipeline, stages: ds.stages.filter((s) => s.pipelineId === p.id).map((s) => ({ id: s.id, name: s.name, businessStage: s.businessStage })) })),
        calendars: ds.calendars.filter((c) => c.accountId === a.id).map((c) => ({ id: c.id, name: c.name, callNumber: c.callNumber, isSalesCalendar: c.isSalesCalendar })),
        runs: [],
      })),
      events: [],
    };
  }
  const db = await createUserClient();
  const [acc, pipes, stages, cals, runs, events] = await Promise.all([
    db.from("ghl_accounts").select("*").order("name"),
    db.from("pipelines").select("id, account_id, name, is_sales_pipeline").order("name"),
    db.from("pipeline_stages").select("id, pipeline_id, name, position, business_stage").order("position"),
    db.from("calendars").select("id, account_id, name, call_number, is_sales_calendar").order("name"),
    db.from("sync_runs").select("id, account_id, kind, status, started_at, finished_at, counts, error").order("started_at", { ascending: false }).limit(60),
    db.from("webhook_events").select("id, event_type, location_id, status, attempts, last_error, received_at").order("received_at", { ascending: false }).limit(25),
  ]);
  return {
    accounts: (acc.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      locationId: a.location_id,
      authType: a.auth_type,
      credentialEnvVar: a.credential_env_var,
      // Report presence only — never the value.
      credentialPresent: a.auth_type === "private_integration" ? Boolean(env.credentialFromEnv(a.credential_env_var)) : null,
      connectionStatus: a.connection_status,
      lastSuccessfulSyncAt: a.last_successful_sync_at,
      lastSyncStartedAt: a.last_sync_started_at,
      webhookStatus: a.webhook_status,
      lastWebhookAt: a.last_webhook_at,
      lastError: a.last_error,
      lastErrorAt: a.last_error_at,
      grantedScopes: a.granted_scopes,
      timezone: a.timezone,
      color: a.color,
      active: a.active,
      pipelines: (pipes.data ?? [])
        .filter((p) => p.account_id === a.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          isSalesPipeline: p.is_sales_pipeline,
          stages: (stages.data ?? []).filter((s) => s.pipeline_id === p.id).map((s) => ({ id: s.id, name: s.name, businessStage: s.business_stage })),
        })),
      calendars: (cals.data ?? []).filter((c) => c.account_id === a.id).map((c) => ({ id: c.id, name: c.name, callNumber: c.call_number, isSalesCalendar: c.is_sales_calendar })),
      runs: (runs.data ?? [])
        .filter((r) => r.account_id === a.id)
        .slice(0, 5)
        .map((r) => ({ id: r.id, kind: r.kind, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at, counts: r.counts ?? {}, error: r.error })),
    })),
    events: (events.data ?? []).map((e) => ({ id: e.id, eventType: e.event_type, locationId: e.location_id, status: e.status, attempts: e.attempts, lastError: e.last_error, receivedAt: e.received_at })),
  };
}

export function envStatus() {
  return [
    { name: "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY", ok: Boolean(env.supabaseUrl() && env.supabaseAnonKey()), purpose: "Database + auth" },
    { name: "SUPABASE_SERVICE_ROLE_KEY", ok: Boolean(env.supabaseServiceRoleKey()), purpose: "Webhook ingestion & sync (server only)" },
    { name: "CREDENTIALS_ENCRYPTION_KEY", ok: Boolean(env.credentialsKey()), purpose: "Encrypts OAuth tokens at rest" },
    { name: "GHL_CLIENT_ID / GHL_CLIENT_SECRET", ok: Boolean(env.ghlClientId() && env.ghlClientSecret()), purpose: "OAuth marketplace app (needed for webhooks)" },
    { name: "CRON_SECRET", ok: Boolean(env.cronSecret()), purpose: "Protects scheduled reconciliation" },
    { name: "GHL_WEBHOOK_PUBLIC_KEY", ok: true, optional: true, purpose: env.ghlWebhookPublicKey() ? "Custom key set" : "Using key published in GHL docs" },
  ];
}
