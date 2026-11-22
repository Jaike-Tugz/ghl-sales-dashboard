import Link from "next/link";
import { AlertTriangle, BadgeDollarSign, CalendarCheck, CalendarClock, CheckCircle2, CircleDollarSign, Clock, Percent, Trophy, UserPlus, UserX, Wallet, XCircle } from "lucide-react";
import { loadPage } from "@/lib/page";
import { buildContext, computeCallFunnel, computeKpis, computeLeaderboard, computeSeries, previousPeriod } from "@/lib/metrics";
import { KPI_DEFINITIONS as D } from "@/lib/metrics/definitions";
import { fmtCompactCurrency, fmtCurrency, fmtInt, fmtPct, fmtRelative } from "@/lib/format";
import type { SearchParams } from "@/lib/filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/trend-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata = { title: "Overview" };

const delta = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? null : (cur - prev) / Math.abs(prev));

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, ds, settings, filters } = await loadPage(searchParams);
  const k = computeKpis(ctx);
  const prev = computeKpis(buildContext(ds, settings, previousPeriod(filters), ctx.now));
  const series = computeSeries(ctx);
  const funnel = computeCallFunnel(ctx);
  const leaders = computeLeaderboard(ctx).slice(0, 5);
  const visibleAccounts = ctx.ds.accounts;

  if (!ds.accounts.length) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState title="No GHL accounts yet" description="An admin needs to add and connect your sub-accounts under Integrations before any metrics appear." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" description={`Sales activity ${filters.from} → ${filters.to} (${settings.reportingTimezone}). Deltas compare with the previous period of equal length.`} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="New leads" value={fmtInt(k.newLeads)} icon={UserPlus} definition={D.newLeads} delta={delta(k.newLeads, prev.newLeads)} />
        {([1, 2, 3] as const).map((n) => (
          <KpiCard
            key={`s${n}`}
            label={`${["First", "Second", "Third"][n - 1]} calls scheduled`}
            value={fmtInt(k.callsScheduled[n])}
            icon={CalendarClock}
            definition={D.callsScheduled}
            delta={delta(k.callsScheduled[n], prev.callsScheduled[n])}
          />
        ))}
        <KpiCard label="Closed deals" value={fmtInt(k.closedDeals)} icon={Trophy} accent="success" definition={D.closedDeals} delta={delta(k.closedDeals, prev.closedDeals)} />
        {([1, 2, 3] as const).map((n) => (
          <KpiCard
            key={`c${n}`}
            label={`${["First", "Second", "Third"][n - 1]} calls completed`}
            value={fmtInt(k.callsCompleted[n])}
            icon={CalendarCheck}
            accent="success"
            definition={D.callsCompleted}
            delta={delta(k.callsCompleted[n], prev.callsCompleted[n])}
          />
        ))}
        <KpiCard label="Lost opportunities" value={fmtInt(k.lostOpportunities)} icon={XCircle} accent="destructive" definition={D.lostOpportunities} delta={delta(k.lostOpportunities, prev.lostOpportunities)} invert />
        <KpiCard label="No-show rate" value={fmtPct(k.noShowRate)} sub={`${fmtInt(k.noShows)} no-shows · ${fmtInt(k.pendingOutcomes)} pending outcome`} icon={UserX} accent="warning" definition={D.noShowRate} delta={delta(k.noShowRate, prev.noShowRate)} invert />
        <KpiCard label="Win rate (overall conversion)" value={fmtPct(k.winRate)} icon={Percent} definition={D.winRate} delta={delta(k.winRate, prev.winRate)} />
        <KpiCard label="Lead-to-close" value={fmtPct(k.leadToClose)} sub={`cohort of ${fmtInt(k.leadToCloseCohortSize)}`} icon={CheckCircle2} definition={D.leadToClose} delta={delta(k.leadToClose, prev.leadToClose)} />
        <KpiCard label="Pipeline value (open)" value={fmtCompactCurrency(k.pipelineValue)} sub="point-in-time" icon={CircleDollarSign} definition={D.pipelineValue} />
        <KpiCard label="Closed-won value" value={fmtCompactCurrency(k.closedWonValue)} sub="booked, not collected" icon={BadgeDollarSign} accent="success" definition={D.closedWonValue} delta={delta(k.closedWonValue, prev.closedWonValue)} />
        <KpiCard label="Collected revenue" value={fmtCompactCurrency(k.collectedRevenue)} sub="payments received" icon={Wallet} accent="success" definition={D.collectedRevenue} delta={delta(k.collectedRevenue, prev.collectedRevenue)} />
        <KpiCard label="Pending follow-ups" value={fmtInt(k.pendingFollowUps)} sub="right now" icon={Clock} accent="warning" definition={D.pendingFollowUps} />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Activity trend</CardTitle>
            <CardDescription>New leads, calls completed and deals won per {filters.granularity}</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={series as unknown as Array<Record<string, number | string>>}
              series={[
                { key: "newLeads", label: "New leads" },
                { key: "callsCompleted", label: "Calls completed" },
                { key: "dealsWon", label: "Deals won" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Funnel (completed calls)</CardTitle>
            <CardDescription>Leads created in range · lead-to-close {fmtPct(funnel.leadToClose)}</CardDescription>
          </CardHeader>
          <CardContent>
            <FunnelChart steps={funnel.steps.map((s) => ({ ...s, avgDays: s.avgDaysInPrevious }))} />
            <Link href="/funnel" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
              Full funnel analysis →
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top representatives</CardTitle>
            <CardDescription>By closed-won value in range</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {leaders.length === 0 && <p className="text-sm text-muted-foreground">No representatives in scope.</p>}
            {leaders.map((r, i) => (
              <div key={r.key} className="flex items-center gap-3">
                <span className="w-4 text-xs text-muted-foreground tabular">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {r.dealsClosed} won · {r.callsCompleted} calls · {fmtPct(r.leadToClose)} lead-to-close
                  </div>
                </div>
                <div className="text-sm font-semibold tabular">{fmtCurrency(r.closedWonValue)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sync health</CardTitle>
            <CardDescription>Per GHL sub-account</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {visibleAccounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <span className="size-2.5 rounded-full" style={{ background: a.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    Synced {fmtRelative(a.lastSuccessfulSyncAt)} · webhook {fmtRelative(a.lastWebhookAt)}
                  </div>
                </div>
                {a.lastError ? (
                  <Badge variant="warning">
                    <AlertTriangle /> Attention
                  </Badge>
                ) : a.connectionStatus === "connected" ? (
                  <Badge variant="success">Healthy</Badge>
                ) : (
                  <Badge variant="secondary" className="capitalize">{a.connectionStatus.replace("_", " ")}</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
