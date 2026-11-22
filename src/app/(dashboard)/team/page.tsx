import Link from "next/link";
import { loadPage } from "@/lib/page";
import { computeLeaderboard } from "@/lib/metrics";
import { fmtCurrency, fmtDays, fmtInt, fmtPct } from "@/lib/format";
import type { SearchParams } from "@/lib/filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { ExportButton } from "@/components/dashboard/export-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { InfoTip } from "@/components/dashboard/info-tip";

export const metadata = { title: "Sales Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, sp } = await loadPage(searchParams);
  const rows = computeLeaderboard(ctx);
  const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  return (
    <>
      <PageHeader
        title="Sales Team"
        description="One row per person: a rep who works in several sub-accounts is matched across them by email, so definitions stay identical across all accounts."
      >
        <ExportButton kind="team" />
      </PageHeader>
      {rows.length === 0 ? (
        <EmptyState title="No representatives in scope" description="Reps appear once GHL users are synced for the selected accounts." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Representative</TableHead>
                <TableHead className="text-right">Leads assigned</TableHead>
                <TableHead className="text-right">Calls sched.</TableHead>
                <TableHead className="text-right">Calls done</TableHead>
                <TableHead className="text-right">No-shows</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    1→2 conv. <InfoTip text="Of the rep's leads created in range that completed call 1, the share that completed call 2." />
                  </span>
                </TableHead>
                <TableHead className="text-right">2→3 conv.</TableHead>
                <TableHead className="text-right">Deals won</TableHead>
                <TableHead className="text-right">Won value</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Lead→close</TableHead>
                <TableHead className="text-right">Avg cycle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.key}>
                  <TableCell className="text-xs text-muted-foreground tabular">{i + 1}</TableCell>
                  <TableCell>
                    <Link href={`/team/${encodeURIComponent(r.key)}${q ? `?${q}` : ""}`} className="font-medium hover:text-primary hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">{r.accountNames.join(", ")}</div>
                  </TableCell>
                  <TableCell className="text-right tabular">{fmtInt(r.leadsAssigned)}</TableCell>
                  <TableCell className="text-right tabular">{fmtInt(r.callsScheduled)}</TableCell>
                  <TableCell className="text-right tabular">{fmtInt(r.callsCompleted)}</TableCell>
                  <TableCell className="text-right tabular">{fmtInt(r.noShows)}</TableCell>
                  <TableCell className="text-right tabular">{fmtPct(r.secondCallConversion, 0)}</TableCell>
                  <TableCell className="text-right tabular">{fmtPct(r.thirdCallConversion, 0)}</TableCell>
                  <TableCell className="text-right tabular">{fmtInt(r.dealsClosed)}</TableCell>
                  <TableCell className="text-right font-medium tabular">{fmtCurrency(r.closedWonValue)}</TableCell>
                  <TableCell className="text-right tabular">{fmtCurrency(r.collectedRevenue)}</TableCell>
                  <TableCell className="text-right tabular">{fmtPct(r.leadToClose, 0)}</TableCell>
                  <TableCell className="text-right tabular">{fmtDays(r.avgSalesCycleDays)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
