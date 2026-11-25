import { CalendarClock, CircleSlash, Megaphone, Percent } from "lucide-react";
import { loadPage } from "@/lib/page";
import { previousPeriod } from "@/lib/metrics";
import { breakdownBy, isLostLead } from "@/lib/metrics/sources";
import { campaignSeries, FB_LEVELS, isFacebookLead, type FbLevel } from "@/lib/metrics/fb-ads";
import { fmtDate, fmtInt, fmtPct } from "@/lib/format";
import { inRange, rangeFromDates } from "@/lib/time";
import type { SearchParams } from "@/lib/filters";
import type { Lead } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BreakdownTable } from "@/components/dashboard/source-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { MeterList, ofText } from "@/components/charts/meter-list";

export const metadata = { title: "FB Ads" };

const delta = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? null : (cur - prev) / Math.abs(prev));

export default async function FbAdsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, settings, filters, sp } = await loadPage(searchParams);
  const tz = settings.reportingTimezone;
  const ds = ctx.ds;
  const stageName = new Map(ds.stages.map((s) => [s.id, s.name]));
  const fbLeads = ds.leads.filter(isFacebookLead);

  const prev = previousPeriod(filters);
  const prevRange = rangeFromDates(prev.from, prev.to, tz);
  const cohort = fbLeads.filter((l) => inRange(l.createdAt, ctx.range));
  const prevCohort = fbLeads.filter((l) => inRange(l.createdAt, prevRange));

  const bookedIds = new Set(ds.appointments.filter((a) => a.leadId && a.ghlStatus !== "cancelled" && a.ghlStatus !== "invalid").map((a) => a.leadId!));
  const stats = (ls: Lead[]) => {
    const booked = ls.filter((l) => bookedIds.has(l.id)).length;
    const lost = ls.filter((l) => isLostLead(l, l.stageId ? stageName.get(l.stageId) : undefined)).length;
    return { leads: ls.length, booked, lost, bookedRate: ls.length ? booked / ls.length : null, lostRate: ls.length ? lost / ls.length : null };
  };
  const cur = stats(cohort);
  const before = stats(prevCohort);

  const level = (FB_LEVELS.find((l) => l.key === sp.level)?.key ?? "campaign") as FbLevel;
  const lv = FB_LEVELS.find((l) => l.key === level)!;
  const rows = breakdownBy(cohort, ds.appointments, ds.stages, lv.get, lv.parent ?? undefined);
  const chart = campaignSeries(fbLeads, filters, ctx.range, tz);
  const leadTrend = chart.data.map((p) => chart.series.reduce((a, s) => a + Number(p[s.key] ?? 0), 0));
  const adLevel = FB_LEVELS.find((l) => l.key === "ad")!;
  const adRows = breakdownBy(cohort, ds.appointments, ds.stages, adLevel.get, adLevel.parent ?? undefined)
    .filter((r) => r.label !== "(not set)")
    .slice(0, 6);

  const href = (key: FbLevel) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "level") q.set(k, v);
    if (key !== "campaign") q.set("level", key);
    const s = q.toString();
    return `/fb-ads${s ? `?${s}` : ""}#breakdown`;
  };

  return (
    <>
      <PageHeader
        title="FB Ads"
        description={`Leads from Facebook and Instagram ads, ${fmtDate(new Date(ctx.range.start).toISOString(), tz)} – ${fmtDate(new Date(ctx.range.end - 1).toISOString(), tz)}. Uses the campaign, ad set and ad names your ad links pass to GHL. Outcomes are as of now.`}
      />

      {fbLeads.length === 0 ? (
        <EmptyState icon={Megaphone} title="No Facebook leads yet" description="Leads appear here once GHL records them with a Facebook source or UTM source." />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="FB leads" value={fmtInt(cur.leads)} sub="vs previous period" icon={Megaphone} delta={delta(cur.leads, before.leads)} trend={leadTrend} />
            <KpiCard label="Booked" value={fmtInt(cur.booked)} sub="have an appointment" icon={CalendarClock} delta={delta(cur.booked, before.booked)} />
            <KpiCard label="Booked rate" value={fmtPct(cur.bookedRate, 0)} sub="booked ÷ FB leads" icon={Percent} delta={delta(cur.bookedRate, before.bookedRate)} />
            <KpiCard label="Lost / not interested" value={fmtPct(cur.lostRate, 0)} sub={`${fmtInt(cur.lost)} ${cur.lost === 1 ? "lead" : "leads"}`} icon={CircleSlash} delta={delta(cur.lostRate, before.lostRate)} invert />
          </section>

          <section className="mt-4 grid items-start gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader>
                <CardTitle>FB leads by campaign</CardTitle>
                <CardDescription>New leads per {filters.granularity}, stacked by campaign</CardDescription>
              </CardHeader>
              <CardContent>
                <StackedColumns data={chart.data} series={chart.series} />
              </CardContent>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Booked rate by ad</CardTitle>
                <CardDescription>Share of each ad&apos;s leads that booked an appointment</CardDescription>
              </CardHeader>
              <CardContent>
                <MeterList
                  empty="No ad names in range. Ads appear here when your ad links pass utm_content."
                  rows={adRows.map((r) => ({ label: r.label, sub: r.parent, ratio: r.bookedRate, detail: ofText(r.booked, r.leads) }))}
                />
              </CardContent>
            </Card>
          </section>

          <section id="breakdown" className="mt-4 scroll-mt-24">
            <BreakdownTable
              title="Performance"
              columnLabel={lv.label}
              rows={rows}
              tabs={FB_LEVELS.map((l) => ({ key: l.key, label: l.label, href: href(l.key), active: l.key === level }))}
              description={`${fmtInt(cohort.length)} FB leads created in range, by ${lv.label.toLowerCase()}.${level === "adset" ? " Ad set comes from UTM medium; ad from UTM content." : ""} Spend and cost per lead need a Meta Ads connection.`}
            />
          </section>
        </>
      )}
    </>
  );
}
