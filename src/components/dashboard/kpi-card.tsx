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
}

export function KpiCard({ label, value, sub, icon: Icon, definition, delta, invert }: KpiCardProps) {
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
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight tabular">{value}</div>
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
