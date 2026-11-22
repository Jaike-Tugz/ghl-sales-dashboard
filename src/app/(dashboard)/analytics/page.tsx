import { loadPage } from "@/lib/page";
import { averageTimeToClose, breakdownBy, buildContext, computeCallFunnel, computeKpis, computeSeries, previousPeriod } from "@/lib/metrics";
import { fmtCurrency, fmtDays, fmtInt, fmtPct } from "@/lib/format";
import type { SearchParams } from "@/lib/filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/trend-chart";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { GranularityToggle } from "@/components/dashboard/granularity-toggle";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata = { title: "Analytics" };

type Row = Array<Record<string, number | string>>;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, ds, settings, filters } = await loadPage(searchParams);
  const series = computeSeries(ctx) as unknown as Row;
  const funnel = computeCallFunnel(ctx);
  const byAccount = breakdownBy(ctx, "account");
  const byRep = breakdownBy(ctx, "rep").slice(0, 10);
  const bySource = breakdownBy(ctx, "source");
  const ttc = averageTimeToClose(ctx);
  const prevFilters = previousPeriod(filters);
  const cur = computeKpis(ctx);
  const prev = computeKpis(buildContext(ds, settings, prevFilters, ctx.now));
  const hasData = ctx.ds.leads.length > 0;

  if (!hasData) return (<><PageHeader title="Analytics" /><EmptyState title="No synchronised records yet" description="Charts populate once opportunities and appointments are synced from GHL." /></>);

  const compare = [
    ["New leads", cur.newLeads, prev.newLeads, fmtInt],
    ["Calls completed", cur.callsCompleted[1] + cur.callsCompleted[2] + cur.callsCompleted[3], prev.callsCompleted[1] + prev.callsCompleted[2] + prev.callsCompleted[3], fmtInt],
    ["Deals won", cur.closedDeals, prev.closedDeals, fmtInt],
    ["Closed-won value", cur.closedWonValue, prev.closedWonValue, fmtCurrency],
    ["Collected revenue", cur.collectedRevenue, prev.collectedRevenue, fmtCurrency],
    ["Win rate", cur.winRate, prev.winRate, (v: number) => fmtPct(v)],
    ["No-show rate", cur.noShowRate, prev.noShowRate, (v: number) => fmtPct(v)],
  ] as const;

  return (
    <>
      <PageHeader title="Analytics" description={`${filters.from} → ${filters.to}, bucketed by ${filters.granularity} in ${settings.reportingTimezone}.`}>
        <GranularityToggle value={filters.granularity} />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead volume</CardTitle>
            <CardDescription>New sales-pipeline opportunities</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={series} series={[{ key: "newLeads", label: "New leads" }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Calls over time</CardTitle>
            <CardDescription>Booked (by booking date) vs completed and no-show (by start date)</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={series}
              series={[
                { key: "callsScheduled", label: "Scheduled" },
                { key: "callsCompleted", label: "Completed" },
                { key: "noShows", label: "No-shows" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revenue over time</CardTitle>
            <CardDescription>Closed-won value (booked) vs collected payments — not the same thing</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={series} series={[{ key: "wonValue", label: "Closed-won value" }, { key: "collected", label: "Collected" }]} currency />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stage conversion & drop-off</CardTitle>
            <CardDescription>Completed-call funnel for leads created in range</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={funnel.steps.slice(1).map((s) => ({ label: s.label, progression: s.progression ?? 0, dropOff: s.dropOff ?? 0 }))}
              series={[{ key: "progression", label: "Progressed" }, { key: "dropOff", label: "Dropped off" }]}
              percent
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revenue by sub-account</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={byAccount as unknown as Row} series={[{ key: "wonValue", label: "Closed-won value" }, { key: "collected", label: "Collected" }]} currency height={Math.max(160, byAccount.length * 56)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revenue by representative</CardTitle>
            <CardDescription>Top 10 by closed-won value</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={byRep as unknown as Row} series={[{ key: "wonValue", label: "Closed-won value" }, { key: "collected", label: "Collected" }]} currency height={Math.max(160, byRep.length * 44)} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Lead source performance</CardTitle>
            <CardDescription>Conversion = cohort leads from that source now won</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Lead→close</TableHead>
                  <TableHead className="text-right">Won in range</TableHead>
                  <TableHead className="text-right">Won value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySource.map((b) => (
                  <TableRow key={b.key}>
                    <TableCell className="font-medium">{b.label}</TableCell>
                    <TableCell className="text-right tabular">{fmtInt(b.leads)}</TableCell>
                    <TableCell className="text-right tabular">{fmtPct(b.conversion)}</TableCell>
                    <TableCell className="text-right tabular">{fmtInt(b.won)}</TableCell>
                    <TableCell className="text-right tabular">{fmtCurrency(b.wonValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Period comparison</CardTitle>
            <CardDescription>
              vs {prevFilters.from} → {prevFilters.to} · avg time to close {fmtDays(ttc.days)} ({ttc.sample} deals)
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Now</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compare.map(([label, a, b, f]) => (
                  <TableRow key={label}>
                    <TableCell className="text-xs">{label}</TableCell>
                    <TableCell className="text-right text-xs font-medium tabular">{a == null ? "—" : (f as (v: number) => string)(a)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular">{b == null ? "—" : (f as (v: number) => string)(b)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
