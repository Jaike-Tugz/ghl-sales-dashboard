import Link from "next/link";
import { fmtInt, fmtPct } from "@/lib/format";
import { NOT_SET, SOURCE_DIMENSIONS, type SourceDimension, type SourceRow } from "@/lib/metrics/sources";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface BreakdownTab {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

/** Lead outcomes grouped by one dimension, with tabs (links) to switch the grouping. */
export function BreakdownTable({ title, description, tabs, columnLabel, rows }: { title: string; description: React.ReactNode; tabs: BreakdownTab[]; columnLabel: string; rows: SourceRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <nav aria-label="Group by" className="-mx-1 flex flex-wrap gap-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              scroll={false}
              aria-current={t.active ? "true" : undefined}
              className={cn("rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground", t.active && "bg-secondary text-foreground")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No leads created in this range.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{columnLabel}</TableHead>
                <TableHead className="w-[28%]">Share</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Booked rate</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Lost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="max-w-80" title={r.label}>
                    <div className={cn("truncate text-sm", r.label === NOT_SET ? "text-muted-foreground" : "font-medium")}>{r.label}</div>
                    {r.parent && <div className="truncate text-xs text-muted-foreground">{r.parent}</div>}
                  </TableCell>
                  <TableCell>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${(r.leads / max) * 100}%` }} />
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular">{fmtInt(r.leads)}</TableCell>
                  <TableCell className="text-right text-sm tabular">{fmtInt(r.booked)}</TableCell>
                  <TableCell className="text-right text-sm tabular">{fmtPct(r.bookedRate, 0)}</TableCell>
                  <TableCell className="text-right text-sm tabular">{fmtInt(r.won)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground tabular">{fmtInt(r.lost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Overview's "Lead sources" card: the breakdown table over the source / UTM dimensions. */
export function SourceTable({
  rows,
  dimension,
  href,
  coverage,
  cohort,
}: {
  rows: SourceRow[];
  dimension: SourceDimension;
  href: (by: SourceDimension) => string;
  /** Share of leads with any value for this dimension. */
  coverage: number | null;
  cohort: number;
}) {
  const label = SOURCE_DIMENSIONS.find((d) => d.key === dimension)?.label ?? "Source";
  return (
    <BreakdownTable
      title="Lead sources"
      columnLabel={label}
      rows={rows}
      tabs={SOURCE_DIMENSIONS.map((d) => ({ key: d.key, label: d.label, href: href(d.key), active: d.key === dimension }))}
      description={
        <>
          {fmtInt(cohort)} leads created in range, by {label.toLowerCase()}. Outcomes are as of now.
          {coverage != null && coverage < 1 && ` ${label} is set for ${fmtPct(coverage, 0)} of them.`}
        </>
      }
    />
  );
}
