import { AlertTriangle, CheckCircle2, Link2, ShieldCheck, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth/viewer";
import { getSettings, isDemoMode } from "@/lib/data";
import { envStatus, getIntegrationData } from "@/lib/data/integrations";
import { env } from "@/lib/env";
import { fmtDate, fmtRelative } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddAccountForm, MappingForm, SyncButton } from "@/components/integrations/forms";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata = { title: "Integrations" };

function StatusBadge({ status }: { status: string }) {
  const v = status === "connected" || status === "active" || status === "succeeded" || status === "processed" ? "success" : status === "error" || status === "failed" || status === "revoked" || status === "dead" ? "destructive" : status === "partial" ? "warning" : "secondary";
  return <Badge variant={v} className="capitalize">{status.replace("_", " ")}</Badge>;
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireRole("admin", "manager");
  const [{ accounts, events }, settings, sp] = await Promise.all([getIntegrationData(), getSettings(), searchParams]);
  const isAdmin = viewer.role === "admin";
  const demo = isDemoMode();
  const tz = settings.reportingTimezone;
  const webhookUrl = `${env.appUrl()}/api/webhooks/ghl`;
  const stageLabels = Object.fromEntries(settings.funnelStages.map((s) => [s.key, s.label]));
  return (
    <>
      <PageHeader title="Integrations" description="Connect GoHighLevel sub-accounts, map pipelines and calendars, and monitor sync health. All access to GHL is read-only." />
      {sp.connected && <p className="mb-4 rounded-lg bg-success/10 p-3 text-sm text-success">GHL authorisation completed for {sp.connected}. Run a sync to load data.</p>}
      {sp.oauth_error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">OAuth failed: {sp.oauth_error}</p>}

      {isAdmin && (
        <div className="mb-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Add a sub-account</CardTitle>
              <CardDescription>Four accounts to start — the design has no upper limit.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddAccountForm disabled={demo} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" /> Server configuration
              </CardTitle>
              <CardDescription>Presence only — values are never displayed</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {envStatus().map((e) => (
                <div key={e.name} className="flex items-start gap-2 text-xs">
                  {e.ok ? <CheckCircle2 className="mt-0.5 size-3.5 text-success" /> : <XCircle className="mt-0.5 size-3.5 text-destructive" />}
                  <div>
                    <div className="font-mono text-[11px]">{e.name}</div>
                    <div className="text-muted-foreground">{e.purpose}</div>
                  </div>
                </div>
              ))}
              <div className="mt-2 rounded-md bg-muted p-2 text-[11px]">
                Webhook URL for your GHL app: <code className="break-all font-mono">{webhookUrl}</code>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {accounts.length === 0 && <EmptyState title="No sub-accounts yet" description="Add your first GHL sub-account above." />}

      <div className="grid gap-4">
        {accounts.map((a) => (
          <Card key={a.id} className={a.active ? "" : "opacity-60"}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="size-2.5 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </CardTitle>
                <CardDescription className="mt-1 font-mono">Location {a.locationId}</CardDescription>
              </div>
              {isAdmin && (
                <div className="flex items-start gap-2">
                  {a.authType === "oauth" && (
                    <Button size="sm" asChild={!demo} disabled={demo}>
                      {demo ? (
                        <span>
                          <Link2 /> Connect with GHL
                        </span>
                      ) : (
                        <a href={`/api/ghl/oauth/start?account=${a.id}`}>
                          <Link2 /> {a.connectionStatus === "connected" ? "Reconnect" : "Connect with GHL"}
                        </a>
                      )}
                    </Button>
                  )}
                  <SyncButton accountId={a.id} disabled={demo} />
                </div>
              )}
            </CardHeader>
            <CardContent className="grid gap-5">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs md:grid-cols-4 xl:grid-cols-7">
                <div>
                  <dt className="text-muted-foreground">Connection</dt>
                  <dd className="mt-1"><StatusBadge status={a.connectionStatus} /></dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Auth</dt>
                  <dd className="mt-1">
                    {a.authType === "oauth" ? "OAuth app" : "Private integration"}
                    {a.authType === "private_integration" && (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {a.credentialEnvVar} {a.credentialPresent ? "✓ set" : "✗ missing"}
                      </div>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last successful sync</dt>
                  <dd className="mt-1" title={fmtDate(a.lastSuccessfulSyncAt, tz, true)}>{fmtRelative(a.lastSuccessfulSyncAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Webhooks</dt>
                  <dd className="mt-1 flex flex-col gap-1">
                    <StatusBadge status={a.authType === "oauth" ? a.webhookStatus : "unavailable"} />
                    <span className="text-[10px] text-muted-foreground">last {fmtRelative(a.lastWebhookAt)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Timezone</dt>
                  <dd className="mt-1">{a.timezone ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">API error status</dt>
                  <dd className="mt-1">
                    {a.lastError ? (
                      <span className="flex items-start gap-1 text-destructive">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span>
                          {a.lastError} <span className="text-muted-foreground">({fmtRelative(a.lastErrorAt)})</span>
                        </span>
                      </span>
                    ) : (
                      <span className="text-success">No errors</span>
                    )}
                  </dd>
                </div>
              </dl>
              {a.authType === "private_integration" && (
                <p className="rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
                  Private integration tokens cannot receive GHL marketplace webhooks; this account is kept current by scheduled reconciliation only.
                </p>
              )}
              {!a.pipelines.some((p) => p.isSalesPipeline) && a.pipelines.length > 0 && (
                <p className="rounded-md bg-warning/10 p-2 text-[11px]">No sales pipeline is marked yet, so every pipeline is being counted. Mark your sales pipeline(s) below.</p>
              )}
              <MappingForm accountId={a.id} pipelines={a.pipelines} calendars={a.calendars} disabled={!isAdmin || demo} stageLabels={stageLabels} />
              {a.runs.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent sync runs</h4>
                  <Table>
                    <TableBody>
                      {a.runs.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{fmtDate(r.startedAt, tz, true)}</TableCell>
                          <TableCell className="text-xs capitalize">{r.kind}</TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="max-w-md truncate text-[11px] text-muted-foreground" title={r.error ?? ""}>
                            {r.error ?? Object.entries(r.counts).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {isAdmin && !demo && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Recent webhook events</CardTitle>
            <CardDescription>Stored before processing; duplicates are rejected by webhookId. Failed events retry with exponential backoff.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {events.length === 0 ? (
              <p className="px-5 text-xs text-muted-foreground">No webhook events received yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{fmtDate(e.receivedAt, tz, true)}</TableCell>
                      <TableCell className="text-xs font-mono">{e.eventType}</TableCell>
                      <TableCell className="text-xs font-mono">{e.locationId ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={e.status} /></TableCell>
                      <TableCell className="text-xs tabular">{e.attempts}</TableCell>
                      <TableCell className="max-w-xs truncate text-[11px] text-muted-foreground">{e.lastError ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
