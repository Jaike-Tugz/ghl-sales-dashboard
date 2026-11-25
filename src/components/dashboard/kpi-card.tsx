import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { InfoTip } from "./info-tip";

export interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  definition?: string;
  /** Change vs the previous equal-length period, as a ratio (0.12 = +12%). */
  delta?: number | null;
  /** When lower is better (e.g. no-show rate), a fall is shown as positive. */
  invert?: boolean;
  accent?: "primary" | "success" | "warning" | "destructive";
  /** Values per period (oldest → newest) for a small trend line under the number. */
  trend?: number[];
}

/** Quiet trend line: grey line, the latest point marked in the accent. No axes; the card's number is the read. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 32;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`-4 0 ${w + 8} ${h}`} className="h-8 w-28 overflow-visible" aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="var(--chart-1)" opacity={0.08} />
      <path d={d} fill="none" stroke="var(--muted-foreground)" strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3.5} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}

export function KpiCard({ label, value, sub, icon: Icon, definition, delta, invert, trend }: KpiCardProps) {
  const good = delta == null || delta === 0 ? null : invert ? delta < 0 : delta > 0;
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {label}
          {definition && <InfoTip text={definition} />}
        </div>
        {Icon && <Icon strokeWidth={1.5} className="size-4 text-muted-foreground/60" />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-[28px] font-semibold leading-none tracking-tight">{value}</div>
        {trend && <Sparkline values={trend} />}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        {delta !== undefined && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good == null ? "" : good ? "text-success" : "text-destructive")}>
            <DeltaIcon className="size-3" />
            {delta == null ? "n/a" : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}%`}
          </span>
        )}
        {sub && <span className="truncate">{sub}</span>}
      </div>
    </Card>
  );
}
