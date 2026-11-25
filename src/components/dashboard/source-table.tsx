import Link from "next/link";
import { fmtInt, fmtPct } from "@/lib/format";
import { NOT_SET, SOURCE_DIMENSIONS, type SourceDimension, type SourceRow } from "@/lib/metrics/sources";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Lead outcomes by source / UTM dimension, with dimension tabs kept in the URL (?by=). */
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
  const max = Math.max(1, ...rows.map((r) => r.leads));
  const label = SOURCE_DIMENSIONS.find((d) => d.key === dimension)?.label ?? "Source";
  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Lead sources</CardTitle>
          <CardDescription>
            {fmtInt(cohort)} leads created in range, by {label.toLowerCase()}. Outcomes are as of now.
            {coverage != null && coverage < 1 && ` ${label} is set for ${fmtPct(coverage, 0)} of them.`}
          </CardDescription>
        </div>
        <nav aria-label="Group by" className="-mx-1 flex flex-wrap gap-1">
          {SOURCE_DIMENSIONS.map((d) => (
            <Link
              key={d.key}
              href={href(d.key)}
              scroll={false}
              aria-current={d.key === dimension ? "true" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
                d.key === dimension && "bg-secondary text-foreground",
              )}
            >
              {d.label}
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
                <TableHead>{label}</TableHead>
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
                  <TableCell className={cn("max-w-80 truncate text-sm", r.label === NOT_SET ? "text-muted-foreground" : "font-medium")} title={r.label}>
                    {r.label}
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
