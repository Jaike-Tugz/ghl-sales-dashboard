import Link from "next/link";
import { BellRing } from "lucide-react";
import { loadPage } from "@/lib/page";
import { computeFollowUps } from "@/lib/metrics";
import { FOLLOW_UP_LABELS } from "@/lib/settings-defaults";
import { fmtDate, fmtInt } from "@/lib/format";
import type { SearchParams } from "@/lib/filters";
import type { FollowUpRuleKey } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { ExportButton } from "@/components/dashboard/export-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Pagination, paginate } from "@/components/dashboard/pagination";
import { cn } from "@/lib/utils";

export const metadata = { title: "Follow-Ups" };

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, settings, sp } = await loadPage(searchParams);
  const all = computeFollowUps(ctx);
  const ruleFilter = typeof sp.rule === "string" ? (sp.rule as FollowUpRuleKey) : null;
  const items = ruleFilter ? all.filter((i) => i.reasons.includes(ruleFilter)) : all;
  const { slice, page, pages, total } = paginate(items, sp.page);
  const counts = new Map<FollowUpRuleKey, number>();
  for (const i of all) for (const r of i.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  const baseQ = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "rule" && k !== "page") as [string, string][]);
  const tz = settings.reportingTimezone;
  return (
    <>
      <PageHeader
        title="Follow-Ups"
        description="Open leads that need attention, evaluated now against the thresholds in Settings. Monitoring only — nothing is sent and no GHL record is changed."
      >
        <ExportButton kind="follow-ups" />
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={`/follow-ups?${baseQ}`} className={cn("rounded-full border px-3 py-1 text-xs", !ruleFilter && "border-primary bg-primary/10 text-primary")}>
          All ({fmtInt(all.length)})
        </Link>
        {settings.followUpRules.map((r) => {
          const q = new URLSearchParams(baseQ);
          q.set("rule", r.key);
          return (
            <Link
              key={r.key}
              href={`/follow-ups?${q}`}
              className={cn("rounded-full border px-3 py-1 text-xs", ruleFilter === r.key && "border-primary bg-primary/10 text-primary", !r.enabled && "opacity-50")}
              title={r.enabled ? `Threshold: ${r.thresholdDays} days` : "Disabled in Settings"}
            >
              {r.label} ({fmtInt(counts.get(r.key) ?? 0)}) · {r.thresholdDays}d
            </Link>
          );
        })}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={BellRing} title="Nothing needs follow-up" description="No open lead currently breaches an enabled rule." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Sub-account</TableHead>
                <TableHead>Assigned rep</TableHead>
                <TableHead>Current stage</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Days inactive</TableHead>
                <TableHead>Why</TableHead>
                <TableHead>Recommended next action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slice.map((i) => (
                <TableRow key={i.leadId}>
                  <TableCell className="font-medium">{i.leadName}</TableCell>
                  <TableCell className="text-xs">{i.accountName}</TableCell>
                  <TableCell className="text-xs">{i.repName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="text-xs">{i.stageLabel}</TableCell>
                  <TableCell className="text-xs tabular">{fmtDate(i.lastActivity, tz)}</TableCell>
                  <TableCell className={cn("text-right tabular", i.daysInactive >= 14 && "text-destructive font-medium")}>{i.daysInactive}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {i.reasons.map((r) => (
                        <Badge key={r} variant={r === "missed_no_reschedule" ? "destructive" : r === "inactive" ? "secondary" : "warning"}>
                          {FOLLOW_UP_LABELS[r]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{i.recommendedAction}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pages={pages} total={total} params={sp} basePath="/follow-ups" />
    </>
  );
}
