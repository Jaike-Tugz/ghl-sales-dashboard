import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, Percent, Trophy, UserPlus, UserX, Wallet } from "lucide-react";
import { requireViewer } from "@/lib/auth/viewer";
import { getDataset, getSettings } from "@/lib/data";
import { parseFilters, type SearchParams } from "@/lib/filters";
import { buildContext, computeLeaderboard, computeSeries } from "@/lib/metrics";
import { addDays, todayIn } from "@/lib/time";
import { fmtCompactCurrency, fmtDays, fmtInt, fmtPct } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/trend-chart";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Representative" };

export default async function RepPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<SearchParams> }) {
  const [{ key }, sp, viewer, settings] = await Promise.all([params, searchParams, requireViewer(), getSettings()]);
  const ds = await getDataset(viewer);
  const repKey = decodeURIComponent(key);
  const filters = { ...parseFilters(sp, settings.reportingTimezone, ds.accounts.map((a) => a.id)), repId: repKey };
  const ctx = buildContext(ds, settings, filters);
  const me = computeLeaderboard(ctx).find((r) => r.key === repKey);
  if (!me) notFound();

  // Historical trend: trailing 12 months regardless of the selected range.
  const today = todayIn(settings.reportingTimezone);
  const hist = buildContext(ds, settings, { ...filters, from: addDays(today, -364), to: today, granularity: "month" });
  const series = computeSeries(hist);
  const monthly = computeLeaderboard(hist).find((r) => r.key === repKey);

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/team">
          <ArrowLeft /> Sales Team
        </Link>
      </Button>
      <PageHeader title={me.name} description={`Works in: ${me.accountNames.join(", ")}. Figures for ${filters.from} → ${filters.to}.`} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Leads assigned" value={fmtInt(me.leadsAssigned)} icon={UserPlus} />
        <KpiCard label="Calls completed" value={fmtInt(me.callsCompleted)} sub={`${fmtInt(me.callsScheduled)} scheduled`} icon={CalendarCheck} accent="success" />
        <KpiCard label="No-shows" value={fmtInt(me.noShows)} icon={UserX} accent="warning" />
        <KpiCard label="Deals won" value={fmtInt(me.dealsClosed)} sub={`avg cycle ${fmtDays(me.avgSalesCycleDays)}`} icon={Trophy} accent="success" />
        <KpiCard label="Won value" value={fmtCompactCurrency(me.closedWonValue)} sub={`${fmtCompactCurrency(me.collectedRevenue)} collected`} icon={Wallet} />
        <KpiCard label="Lead-to-close" value={fmtPct(me.leadToClose)} sub={`1→2 ${fmtPct(me.secondCallConversion, 0)} · 2→3 ${fmtPct(me.thirdCallConversion, 0)}`} icon={Percent} />
      </section>
      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity — trailing 12 months</CardTitle>
            <CardDescription>Monthly, in {settings.reportingTimezone}</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={series as unknown as Array<Record<string, number | string>>}
              series={[
                { key: "newLeads", label: "Leads assigned" },
                { key: "callsCompleted", label: "Calls completed" },
                { key: "dealsWon", label: "Deals won" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Won value by month</CardTitle>
            <CardDescription>12-month total {fmtCompactCurrency(monthly?.closedWonValue ?? 0)}</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={series as unknown as Array<Record<string, number | string>>} categoryKey="bucket" layout="horizontal" series={[{ key: "wonValue", label: "Won value" }]} currency />
          </CardContent>
        </Card>
      </section>
    </>
  );
}
