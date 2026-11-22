import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDataset, getSettings } from "@/lib/data";
import { parseFilters } from "@/lib/filters";
import { buildCallRows, buildContext, computeFollowUps, computeLeaderboard, lastActivityFor } from "@/lib/metrics";
import { OUTCOME_LABELS, stageLabel } from "@/lib/settings-defaults";
import { inRange } from "@/lib/time";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** CSV exports use exactly the same scoped dataset and filters as the pages. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const viewer = await getViewer();
  if (!viewer || (viewer as { inactive?: boolean }).inactive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { kind } = await params;
  const [settings, ds] = await Promise.all([getSettings(), getDataset(viewer)]);
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const filters = parseFilters(sp, settings.reportingTimezone, ds.accounts.map((a) => a.id));
  const ctx = buildContext(ds, settings, filters);
  let csv: string;
  switch (kind) {
    case "calls": {
      const c = (x: { date: string; outcome: keyof typeof OUTCOME_LABELS } | null) => [x?.date ?? "", x ? OUTCOME_LABELS[x.outcome] : ""];
      csv = toCsv(
        ["Lead", "Company", "Sub-account", "Rep", "Source", "Stage", "Call 1 date", "Call 1 outcome", "Call 2 date", "Call 2 outcome", "Call 3 date", "Call 3 outcome", "Next scheduled", "Last activity", "Value", "Deal status"],
        buildCallRows(ctx).map((r) => [r.leadName, r.company, r.accountName, r.repName, r.source, r.stageLabel, ...c(r.calls[1]), ...c(r.calls[2]), ...c(r.calls[3]), r.nextScheduled, r.lastActivity, r.value, r.status]),
      );
      break;
    }
    case "leads": {
      const accounts = new Map(ctx.ds.accounts.map((a) => [a.id, a]));
      const reps = new Map(ctx.ds.reps.map((r) => [r.id, r.name]));
      csv = toCsv(
        ["Lead", "Company", "Email", "Sub-account", "GHL location ID", "GHL opportunity ID", "Rep", "Source", "Stage", "Status", "Value", "Created", "Won at", "Last activity"],
        ctx.ds.leads
          .filter((l) => inRange(l.createdAt, ctx.range))
          .map((l) => [l.contactName, l.company, l.email, accounts.get(l.accountId)?.name, accounts.get(l.accountId)?.locationId, l.ghlOpportunityId, l.repId ? reps.get(l.repId) : "", l.source, stageLabel(settings, l.businessStage), l.status, l.monetaryValue, l.createdAt, l.wonAt, lastActivityFor(l, ctx.byLead.get(l.id), ctx.now)]),
      );
      break;
    }
    case "team":
      csv = toCsv(
        ["Rep", "Accounts", "Leads assigned", "Calls scheduled", "Calls completed", "No-shows", "1→2 conversion", "2→3 conversion", "Deals won", "Closed-won value", "Collected revenue", "Lead-to-close", "Avg cycle days"],
        computeLeaderboard(ctx).map((r) => [r.name, r.accountNames.join("; "), r.leadsAssigned, r.callsScheduled, r.callsCompleted, r.noShows, r.secondCallConversion, r.thirdCallConversion, r.dealsClosed, r.closedWonValue, r.collectedRevenue, r.leadToClose, r.avgSalesCycleDays?.toFixed(1)]),
      );
      break;
    case "follow-ups":
      csv = toCsv(
        ["Lead", "Sub-account", "Rep", "Stage", "Last activity", "Days inactive", "Reasons", "Recommended action"],
        computeFollowUps(ctx).map((i) => [i.leadName, i.accountName, i.repName, i.stageLabel, i.lastActivity, i.daysInactive, i.reasons.join("; "), i.recommendedAction]),
      );
      break;
    default:
      return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}_${filters.from}_${filters.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
