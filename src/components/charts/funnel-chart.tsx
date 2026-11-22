"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface FunnelDatum {
  key: string;
  label: string;
  count: number;
  ofCohort: number | null;
  progression: number | null;
  dropOff: number | null;
  avgDays: number | null;
}

const pct = (r: number | null) => (r == null ? "—" : `${(r * 100).toFixed(1)}%`);

/** Interactive horizontal funnel: bar width = share of cohort; hover reveals step detail. */
export function FunnelChart({ steps }: { steps: FunnelDatum[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <div className="flex flex-col gap-1">
      {steps.map((s, i) => {
        const w = Math.max(2, (s.count / max) * 100);
        return (
          <div key={s.key}>
            {i > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 py-1.5 pl-1 text-[11px] text-muted-foreground">
                <span className="text-foreground/80">↓ {pct(s.progression)} progressed</span>
                <span>·</span>
                <span className={cn(s.dropOff != null && s.dropOff > 0.5 && "text-destructive")}>{pct(s.dropOff)} drop-off</span>
                {s.avgDays != null && (
                  <>
                    <span>·</span>
                    <span>avg {s.avgDays.toFixed(1)} days</span>
                  </>
                )}
              </div>
            )}
            <div className="group" onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">{s.label}</span>
                <span className="text-sm font-semibold tabular">
                  {new Intl.NumberFormat("en-AU").format(s.count)}
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{pct(s.ofCohort)}</span>
                </span>
              </div>
              <div className="relative h-7 rounded-md bg-muted/60">
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-primary transition-[width,opacity] duration-700 ease-out"
                  style={{ width: `${w}%`, opacity: hover && hover !== s.key ? 0.45 : 0.55 + 0.45 * (1 - i / Math.max(1, steps.length)) }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
