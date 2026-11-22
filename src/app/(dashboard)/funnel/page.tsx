import { History } from "lucide-react";
import { loadPage } from "@/lib/page";
import { computeCallFunnel, computePipelineFunnel, type FunnelResult } from "@/lib/metrics";
import { fmtDays, fmtInt, fmtPct, fmtDate } from "@/lib/format";
import type { SearchParams } from "@/lib/filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata = { title: "Sales Funnel" };

function FunnelPanel({ f, tz }: { f: FunnelResult; tz: string }) {
  if (!f.cohortSize) return <EmptyState title="No leads created in this range" description="Widen the date range or pick another account." />;
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>{f.basis === "calls" ? "Completed-call funnel" : "Pipeline-stage funnel"}</CardTitle>
          <CardDescription>
            Cohort: {fmtInt(f.cohortSize)} leads created in range · {fmtInt(f.open)} open · {fmtInt(f.lost)} lost · lead-to-close {fmtPct(f.leadToClose)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FunnelChart steps={f.steps.map((s) => ({ ...s, avgDays: s.avgDaysInPrevious }))} />
          {f.basis === "pipeline" && f.historyPartial && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs">
              <History className="mt-0.5 size-3.5 shrink-0" />
              GHL does not expose historical stage changes. Stage history is observed from webhooks/reconciliation
              {f.historyTrackedSince ? ` since ${fmtDate(f.historyTrackedSince, tz)}` : ""}. Leads first seen earlier have one reconstructed entry
              (their current stage at first sync) and are excluded from time-in-stage averages.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Stage detail</CardTitle>
          <CardDescription>Progression = share of the previous stage that reached this one</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="w-32">Progression</TableHead>
                <TableHead className="text-right">Drop-off</TableHead>
                <TableHead className="text-right">Avg time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f.steps.map((s) => (
                <TableRow key={s.key}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  <TableCell className="text-right tabular">{fmtInt(s.count)}</TableCell>
                  <TableCell>
                    {s.progression == null ? (
                      <span className="text-xs text-muted-foreground">cohort</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Progress value={s.progression * 100} className="h-1.5" />
                        <span className="w-12 text-right text-xs tabular">{fmtPct(s.progression, 0)}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">{fmtPct(s.dropOff, 0)}</TableCell>
                  <TableCell className="text-right tabular" title={`${s.avgDaysSample} leads with both timestamps`}>
                    {fmtDays(s.avgDaysInPrevious)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-5 pt-3 text-[11px] text-muted-foreground">Avg time = mean days from reaching the previous stage to reaching this one.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function FunnelPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, settings } = await loadPage(searchParams);
  const calls = computeCallFunnel(ctx);
  const pipeline = computePipelineFunnel(ctx);
  return (
    <>
      <PageHeader
        title="Sales Funnel"
        description="Two views, deliberately separate: completed calls (from appointment outcomes) and pipeline stages entered (from opportunity stage changes). Moving a deal to a stage never counts as a completed call."
      />
      <Tabs defaultValue="calls">
        <TabsList>
          <TabsTrigger value="calls">By completed calls</TabsTrigger>
          <TabsTrigger value="pipeline">By pipeline stage</TabsTrigger>
        </TabsList>
        <TabsContent value="calls">
          <FunnelPanel f={calls} tz={settings.reportingTimezone} />
        </TabsContent>
        <TabsContent value="pipeline">
          <FunnelPanel f={pipeline} tz={settings.reportingTimezone} />
        </TabsContent>
      </Tabs>
    </>
  );
}
