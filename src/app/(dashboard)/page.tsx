import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CircleSlash, UserPlus, Users } from "lucide-react";
import { loadPage } from "@/lib/page";
import { buildContext, computeSeries, previousPeriod } from "@/lib/metrics";
import { fmtDate, fmtInt, fmtRelative } from "@/lib/format";
import { stageCounts, stageTone, TONE_COLOR } from "@/lib/stage-style";
import { coverage, DEFAULT_SOURCE_DIMENSION, isLostLead, SOURCE_DIMENSIONS, sourceBreakdown, type SourceDimension } from "@/lib/metrics/sources";
import { inRange } from "@/lib/time";
import type { SearchParams } from "@/lib/filters";
import type { Lead } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/trend-chart";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SourceTable } from "@/components/dashboard/source-table";

export const metadata = { title: "Overview" };

const delta = (cur: number, prev: number) => (prev === 0 ? null : (cur - prev) / Math.abs(prev));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, ds, settings, filters, sp } = await loadPage(searchParams);
  const tz = settings.reportingTimezone;

  if (!ds.accounts.length) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState title="No GHL accounts yet" description="An admin needs to add and connect your sub-accounts under Integrations before anything appears." />
      </>
    );
  }

  const series = computeSeries(ctx);
  const prevSeries = computeSeries(buildContext(ds, settings, previousPeriod(filters), ctx.now));
  const newLeads = sum(series.map((p) => p.newLeads));
  const booked = sum(series.map((p) => p.callsScheduled));
  const prevNewLeads = sum(prevSeries.map((p) => p.newLeads));
  const prevBooked = sum(prevSeries.map((p) => p.callsScheduled));

  // Current position of every lead (point-in-time, ignores the date range).
  const leads = ctx.ds.leads;
  const stageById = new Map(ctx.ds.stages.map((s) => [s.id, s]));
  const isLost = (l: Lead) => isLostLead(l, l.stageId ? stageById.get(l.stageId)?.name : undefined);
  const lost = leads.filter(isLost).length;
  const active = leads.filter((l) => l.status === "open" && !isLost(l)).length;
  const counts = stageCounts(leads, ctx.ds.stages);
  const max = Math.max(1, ...counts.map((c) => c.count));
  const by = (SOURCE_DIMENSIONS.find((d) => d.key === sp.by)?.key ?? DEFAULT_SOURCE_DIMENSION) as SourceDimension;
  const cohort = leads.filter((l) => inRange(l.createdAt, ctx.range));
  const sources = sourceBreakdown(cohort, ctx.ds.appointments, ctx.ds.stages, by);
  const sourcesHref = (d: SourceDimension) => {
    const q = new URLSearchParams(carried);
    if (d !== DEFAULT_SOURCE_DIMENSION) q.set("by", d);
    const s = q.toString();
    return `/${s ? `?${s}` : ""}#sources`;
  };
  const recent = [...leads].sort((a, b) => (b.lastStageChangeAt ?? b.createdAt).localeCompare(a.lastStageChangeAt ?? a.createdAt)).slice(0, 8);

  const carried = new URLSearchParams();
  for (const k of ["account", "range", "from", "to"]) if (typeof sp[k] === "string") carried.set(k, sp[k] as string);
  const pipelineHref = (stage?: string) => {
    const q = new URLSearchParams(carried);
    if (stage) q.set("gstage", stage);
    const s = q.toString();
    return `/pipeline${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Overview" description={`How your leads are progressing. Activity covers ${fmtDate(new Date(ctx.range.start).toISOString(), tz)} – ${fmtDate(new Date(ctx.range.end - 1).toISOString(), tz)}; stage counts are as of now.`} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="New leads" value={fmtInt(newLeads)} sub="in range" icon={UserPlus} delta={delta(newLeads, prevNewLeads)} />
        <KpiCard label="Appointments booked" value={fmtInt(booked)} sub="in range" icon={CalendarClock} delta={delta(booked, prevBooked)} />
        <KpiCard label="Active leads" value={fmtInt(active)} sub="open, not lost · now" icon={Users} />
        <KpiCard label="Lost / not interested" value={fmtInt(lost)} sub={leads.length ? `${Math.round((lost / leads.length) * 100)}% of all leads · now` : "now"} icon={CircleSlash} />
      </section>

      <section className="mt-6 grid items-start gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <CardTitle>Where leads are now</CardTitle>
              <CardDescription>{fmtInt(leads.length)} leads by current GHL stage</CardDescription>
            </div>
            <Link href={pipelineHref()} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Open lead progress <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {counts.length === 0 && <p className="text-sm text-muted-foreground">No leads synced yet.</p>}
            {counts.map((c) => (
              <Link key={c.name} href={pipelineHref(c.name)} className="group -mx-2 grid grid-cols-[minmax(0,11rem)_1fr_2.5rem] items-center gap-4 rounded-md px-2 py-1.5 hover:bg-muted/50 sm:grid-cols-[minmax(0,14rem)_1fr_3rem]">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: TONE_COLOR[c.tone] }} />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full" style={{ width: `${(c.count / max) * 100}%`, background: TONE_COLOR[c.tone] }} />
                </span>
                <span className="text-right text-sm tabular">{fmtInt(c.count)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recently moved</CardTitle>
            <CardDescription>Latest stage changes</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {recent.map((l) => {
              const st = l.stageId ? stageById.get(l.stageId) : undefined;
              return (
                <div key={l.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.contactName}</div>
                    <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: TONE_COLOR[st ? stageTone(st) : "slate"] }} />
                      {st?.name ?? "No stage"}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular">{fmtRelative(l.lastStageChangeAt ?? l.createdAt, ctx.now)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section id="sources" className="mt-4 scroll-mt-24">
        <SourceTable rows={sources} dimension={by} href={sourcesHref} coverage={coverage(cohort, by)} cohort={cohort.length} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Lead flow</CardTitle>
            <CardDescription>New leads and appointments booked per {filters.granularity}</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={series as unknown as Array<Record<string, number | string>>}
              series={[
                { key: "newLeads", label: "New leads" },
                { key: "callsScheduled", label: "Appointments booked" },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Sync</CardTitle>
            <CardDescription>Per GHL sub-account</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {ctx.ds.accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">Last synced {fmtRelative(a.lastSuccessfulSyncAt, ctx.now)}</div>
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
