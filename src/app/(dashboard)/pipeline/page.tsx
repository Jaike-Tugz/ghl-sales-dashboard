import Link from "next/link";
import { loadPage } from "@/lib/page";
import { fmtDate, fmtInt } from "@/lib/format";
import { stageCounts, stageTone, TONE_COLOR } from "@/lib/stage-style";
import type { SearchParams } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Pagination, paginate } from "@/components/dashboard/pagination";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Lead Progress" };

const TILE = "flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/25";
const TILE_ACTIVE = "border-foreground/60 hover:border-foreground/60";


/** A text cell that truncates long values and shows "—" when empty. */
function Cell({ value }: { value: string | null | undefined }) {
  return (
    <TableCell className="max-w-56 truncate text-sm" title={value ?? undefined}>
      {value || <span className="text-muted-foreground">—</span>}
    </TableCell>
  );
}

function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx, settings, sp, filters } = await loadPage(searchParams);
  const tz = settings.reportingTimezone;
  const now = Date.now();
  const ds = ctx.ds;
  const multiAccount = ds.accounts.length > 1;
  const accounts = new Map(ds.accounts.map((a) => [a.id, a.name]));
  const stageById = new Map(ds.stages.map((s) => [s.id, s]));

  // Current stage is point-in-time, so this view lists every lead regardless of the date range.
  const all = ds.leads;
  const counts = stageCounts(all, ds.stages);
  const selectedStage = typeof sp.gstage === "string" ? counts.find((c) => c.name === sp.gstage) : undefined;
  const selected = selectedStage?.name ?? null;
  const selectedIds = new Set(selectedStage?.stageIds ?? []);

  const nextCall = new Map<string, string>();
  for (const a of ds.appointments) {
    if (!a.leadId || a.startTime < new Date(now).toISOString() || a.ghlStatus === "cancelled" || a.ghlStatus === "invalid") continue;
    const cur = nextCall.get(a.leadId);
    if (!cur || a.startTime < cur) nextCall.set(a.leadId, a.startTime);
  }

  const q = filters.q?.toLowerCase();
  const rows = all
    .filter((l) => !selected || (l.stageId != null && selectedIds.has(l.stageId)))
    .filter((l) => !q || [l.contactName, l.company, l.email, l.contactSource, l.attribution.utmCampaign, l.attribution.utmSource].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => (b.lastStageChangeAt ?? b.createdAt).localeCompare(a.lastStageChangeAt ?? a.createdAt));
  const { slice, page, pages, total } = paginate(rows, sp.page);

  const carry = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page") p.set(k, v);
    for (const [k, v] of Object.entries(patch)) (v == null ? p.delete(k) : p.set(k, v));
    const s = p.toString();
    return `/pipeline${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Lead Progress" description="Where every lead stands right now, using your GHL stages. Refreshes on each sync." />

      {all.length === 0 ? (
        <EmptyState title="No leads yet" description="Leads appear here once your sales pipeline is synced from GHL." />
      ) : (
        <>
          <section className="mb-8">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Distribution</span>
              <span className="text-xs text-muted-foreground tabular">{fmtInt(all.length)} leads</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Leads by stage">
              {counts
                .filter((c) => c.count > 0)
                .map((c) => (
                  <div
                    key={c.name}
                    title={`${c.name}: ${c.count}`}
                    className={cn("h-full border-r-2 border-background last:border-r-0 transition-opacity", selected && selected !== c.name && "opacity-20")}
                    style={{ width: `${(c.count / all.length) * 100}%`, background: TONE_COLOR[c.tone] }}
                  />
                ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              <Link
                href={carry({ gstage: null })}
                scroll={false}
                className={cn(TILE, !selected && TILE_ACTIVE)}
              >
                <span className="text-xs text-muted-foreground">All stages</span>
                <span className="text-xl font-semibold tracking-tight tabular">{fmtInt(all.length)}</span>
              </Link>
              {counts.map((c) => {
                const active = selected === c.name;
                return (
                  <Link
                    key={c.name}
                    href={carry({ gstage: active ? null : c.name })}
                    scroll={false}
                    aria-current={active ? "true" : undefined}
                    className={cn(TILE, active && TILE_ACTIVE, c.count === 0 && "text-muted-foreground")}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs">
                      <Dot color={TONE_COLOR[c.tone]} />
                      <span className="truncate" title={c.name}>
                        {c.name}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold tracking-tight tabular">{fmtInt(c.count)}</span>
                      <span className="text-[11px] text-muted-foreground tabular">{Math.round((c.count / all.length) * 100)}%</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <FilterBar />

          {rows.length === 0 ? (
            <EmptyState title="No leads match" description="Try another stage or clear the search." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Lead</TableHead>
                    <TableHead>Current stage</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Next appointment</TableHead>
                    {multiAccount && <TableHead>Sub-account</TableHead>}
                    <TableHead>Created</TableHead>
                    <TableHead>Last update</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice.map((l) => {
                    const stage = l.stageId ? stageById.get(l.stageId) : undefined;
                    const color = TONE_COLOR[stage ? stageTone(stage) : "lost"];
                    const next = nextCall.get(l.id);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="max-w-72">
                          <div className="truncate font-medium">{l.contactName}</div>
                          <div className="truncate text-xs text-muted-foreground">{l.email ?? l.company ?? "—"}</div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 text-sm">
                            <Dot color={color} />
                            {stage?.name ?? <span className="text-muted-foreground">No stage</span>}
                            {l.status !== "open" && !stage?.name.toLowerCase().includes(l.status) && <span className="text-xs capitalize text-muted-foreground">· {l.status}</span>}
                          </span>
                        </TableCell>
                        <Cell value={l.contactSource ?? l.source} />
                        <TableCell className="text-sm tabular">{next ? fmtDate(next, tz, true) : <span className="text-muted-foreground">—</span>}</TableCell>
                        {multiAccount && <TableCell className="text-sm text-muted-foreground">{accounts.get(l.accountId)}</TableCell>}
                        <TableCell className="text-sm text-muted-foreground tabular">{fmtDate(l.createdAt, tz)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular">{fmtDate(l.lastStageChangeAt ?? l.createdAt, tz)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
          <Pagination page={page} pages={pages} total={total} params={sp} basePath="/pipeline" />
        </>
      )}
    </>
  );
}
