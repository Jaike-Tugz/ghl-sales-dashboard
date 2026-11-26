import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { fmtDate, fmtInt } from "@/lib/format";
import { TONE_COLOR, type StageCount } from "@/lib/stage-style";
import type { Lead } from "@/lib/types";

const DAY = 86_400_000;

/**
 * Read-only board: one column per GHL stage (pipeline order) with a card per
 * lead. Columns scroll sideways inside the board, never the page.
 */
export function LeadBoard({
  columns,
  leadsByStage,
  nextAppt,
  now,
  timeZone,
  moreHref,
  limit = 25,
}: {
  columns: StageCount[];
  /** Keyed by stage name (stages with the same name merge, as in the tiles). */
  leadsByStage: Map<string, Lead[]>;
  nextAppt: Map<string, string>;
  now: number;
  timeZone: string;
  moreHref: (stage: string) => string;
  limit?: number;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:-mx-10 lg:px-10">
      <div className="flex min-w-max gap-3">
        {columns.map((c) => {
          const leads = leadsByStage.get(c.name) ?? [];
          return (
            <section key={c.name} className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40" aria-label={`${c.name}, ${leads.length} leads`}>
              <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: TONE_COLOR[c.tone] }} />
                <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={c.name}>{c.name}</h3>
                <span className="text-xs text-muted-foreground tabular">{fmtInt(leads.length)}</span>
              </header>
              {/* Stage colour as a thin rule under the header. */}
              <div className="mx-3.5 mb-2 h-0.5 rounded-full" style={{ background: TONE_COLOR[c.tone] }} />
              <ul className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto px-2 pb-2">
                {leads.length === 0 && <li className="px-1.5 py-3 text-xs text-muted-foreground">No leads</li>}
                {leads.slice(0, limit).map((l) => {
                  const days = Math.max(0, Math.floor((now - Date.parse(l.lastStageChangeAt ?? l.createdAt)) / DAY));
                  const next = nextAppt.get(l.id);
                  return (
                    <li key={l.id} className="rounded-lg border bg-card px-3 py-2.5">
                      <div className="truncate text-sm font-medium">{l.contactName}</div>
                      <div className="truncate text-xs text-muted-foreground">{l.contactSource ?? l.source ?? l.email ?? "—"}</div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="tabular">{days === 0 ? "Moved today" : `${days} d in stage`}</span>
                        {next && (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground tabular">
                            <CalendarClock className="size-3" aria-hidden />
                            {fmtDate(next, timeZone, true)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
                {leads.length > limit && (
                  <li>
                    <Link href={moreHref(c.name)} className="block rounded-md px-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                      +{fmtInt(leads.length - limit)} more in the list
                    </Link>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
