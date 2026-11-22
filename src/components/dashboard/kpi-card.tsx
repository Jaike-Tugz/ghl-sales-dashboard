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

const ACCENT = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function KpiCard({ label, value, sub, icon: Icon, definition, delta, invert, accent = "primary" }: KpiCardProps) {
  const good = delta == null || delta === 0 ? null : invert ? delta < 0 : delta > 0;
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="group relative overflow-hidden p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {label}
          {definition && <InfoTip text={definition} />}
        </div>
        {Icon && (
          <div className={cn("flex size-7 items-center justify-center rounded-lg", ACCENT[accent])}>
            <Icon className="size-3.5" />
          </div>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
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
