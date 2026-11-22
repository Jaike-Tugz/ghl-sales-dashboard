import { loadPage } from "@/lib/page";
import { buildCallRows } from "@/lib/metrics";
import { canManage } from "@/lib/auth/viewer";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { outcomeOptions, repOptions, stageOptions } from "@/lib/options";
import type { SearchParams } from "@/lib/filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ExportButton } from "@/components/dashboard/export-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DealStatusBadge } from "@/components/dashboard/outcome-badge";
import { OutcomeCell } from "@/components/dashboard/outcome-cell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Pagination, paginate } from "@/components/dashboard/pagination";

export const metadata = { title: "Sales Calls" };

export default async function CallsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, ds, settings, viewer, sp } = await loadPage(searchParams);
  const tz = settings.reportingTimezone;
  const rows = buildCallRows(ctx);
  const { slice, page, pages, total } = paginate(rows, sp.page);
  const editable = canManage(viewer);
  return (
    <>
      <PageHeader
        title="Sales Calls"
        description="Leads with a lead creation or sales appointment in range. Each call column shows the latest appointment for that call number. Outcomes come from GHL appointment status; past appointments GHL never marked show as “Pending outcome”."
      >
        <ExportButton kind="calls" />
      </PageHeader>
      <FilterBar reps={repOptions(ds)} stages={stageOptions(settings)} outcomes={outcomeOptions()} />
      {rows.length === 0 ? (
        <EmptyState title="No sales calls match" description="Try a wider date range or clear the filters." />
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
                <TableHead>First call</TableHead>
                <TableHead>Second call</TableHead>
                <TableHead>Third call</TableHead>
                <TableHead>Next scheduled</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Deal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slice.map((r) => (
                <TableRow key={r.leadId}>
                  <TableCell>
                    <div className="font-medium">{r.leadName}</div>
                    <div className="text-[11px] text-muted-foreground">{r.company ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs">{r.accountName}</TableCell>
                  <TableCell className="text-xs">{r.repName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="text-xs">{r.source ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.stageLabel}</TableCell>
                  {([1, 2, 3] as const).map((n) => (
                    <TableCell key={n}>
                      {r.calls[n] ? (
                        <OutcomeCell appointmentId={r.calls[n]!.appointmentId} outcome={r.calls[n]!.outcome} date={fmtDate(r.calls[n]!.date, tz, true)} editable={editable} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-xs tabular">{fmtDate(r.nextScheduled, tz, true)}</TableCell>
                  <TableCell className="text-xs tabular">{fmtDate(r.lastActivity, tz)}</TableCell>
                  <TableCell className="text-right tabular">{fmtCurrency(r.value)}</TableCell>
                  <TableCell>
                    <DealStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pages={pages} total={total} params={sp} basePath="/calls" />
    </>
  );
}
