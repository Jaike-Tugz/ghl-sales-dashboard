import { ATTENTION, type AttentionItem, type AttentionKind } from "@/lib/metrics/attention";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Leads to act on, grouped by reason (most urgent first), capped per group. */
export function AttentionList({ items, now, perGroup = 2 }: { items: AttentionItem[]; now: number; perGroup?: number }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing waiting. Every open lead is moving.</p>;
  const groups = (Object.keys(ATTENTION) as AttentionKind[])
    .map((k) => ({ kind: k, items: items.filter((i) => i.kind === k) }))
    .filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.kind}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h4 className="text-xs font-medium">{ATTENTION[g.kind].label}</h4>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular">{g.items.length}</span>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">{ATTENTION[g.kind].hint}</p>
          <ul className="flex flex-col">
            {g.items.slice(0, perGroup).map((i) => (
              <li key={i.lead.id} className="flex items-center gap-3 border-t border-border/60 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{i.lead.contactName}</div>
                  {i.stageName && <div className="truncate text-xs text-muted-foreground">{i.stageName}</div>}
                </div>
                <span className={cn("shrink-0 text-xs tabular", g.kind === "upcoming" ? "font-medium" : "text-muted-foreground")}>{fmtRelative(i.at, now)}</span>
              </li>
            ))}
            {g.items.length > perGroup && <li className="border-t border-border/60 pt-2 text-xs text-muted-foreground">+{g.items.length - perGroup} more</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
