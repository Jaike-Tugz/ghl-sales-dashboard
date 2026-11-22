import { loadPage } from "@/lib/page";
import { lastActivityFor } from "@/lib/metrics";
import { stageLabel } from "@/lib/settings-defaults";
import { inRange } from "@/lib/time";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { repOptions, stageOptions } from "@/lib/options";
import type { SearchParams } from "@/lib/filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ExportButton } from "@/components/dashboard/export-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DealStatusBadge } from "@/components/dashboard/outcome-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Pagination, paginate } from "@/components/dashboard/pagination";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, ds, settings, sp, filters } = await loadPage(searchParams);
  const tz = settings.reportingTimezone;
  const accounts = new Map(ctx.ds.accounts.map((a) => [a.id, a.name]));
  const reps = new Map(ctx.ds.reps.map((r) => [r.id, r.name]));
  const q = filters.q?.toLowerCase();
  const rows = ctx.ds.leads
    .filter((l) => inRange(l.createdAt, ctx.range))
    .filter((l) => !filters.stage || l.businessStage === filters.stage)
    .filter((l) => !q || [l.contactName, l.company, l.email].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { slice, page, pages, total } = paginate(rows, sp.page);
  return (
    <>
      <PageHeader title="Leads" description="Opportunities created in a mapped sales pipeline during the selected range. Each keeps its original GHL id and sub-account.">
        <ExportButton kind="leads" />
      </PageHeader>
      <FilterBar reps={repOptions(ds)} stages={stageOptions(settings)} />
      {rows.length === 0 ? (
        <EmptyState title="No leads in this range" description="New opportunities appear here once synced from GHL." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Sub-account</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Calls completed</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slice.map((l) => {
                const s = ctx.byLead.get(l.id);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-medium">{l.contactName}</div>
                      <div className="text-[11px] text-muted-foreground">{l.company ?? l.email ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">{accounts.get(l.accountId)}</TableCell>
                    <TableCell className="text-xs">{l.repId ? reps.get(l.repId) : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="text-xs">{l.source ?? "—"}</TableCell>
                    <TableCell className="text-xs">{stageLabel(settings, l.businessStage)}</TableCell>
                    <TableCell className="text-xs tabular">{s?.maxCompleted ?? 0}</TableCell>
                    <TableCell className="text-xs tabular">{fmtDate(l.createdAt, tz)}</TableCell>
                    <TableCell className="text-xs tabular">{fmtDate(lastActivityFor(l, s, ctx.now), tz)}</TableCell>
                    <TableCell className="text-right tabular">{fmtCurrency(l.monetaryValue)}</TableCell>
                    <TableCell>
                      <DealStatusBadge status={l.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pages={pages} total={total} params={sp} basePath="/leads" />
    </>
  );
}
