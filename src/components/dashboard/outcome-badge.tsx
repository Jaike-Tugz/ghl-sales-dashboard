import { Badge } from "@/components/ui/badge";
import { OUTCOME_LABELS } from "@/lib/settings-defaults";
import type { CallOutcome } from "@/lib/types";

const VARIANT: Record<CallOutcome, "default" | "success" | "warning" | "destructive" | "secondary" | "outline"> = {
  scheduled: "default",
  completed: "success",
  no_show: "destructive",
  cancelled: "secondary",
  rescheduled: "warning",
  pending_outcome: "outline",
};

export function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  return <Badge variant={VARIANT[outcome]}>{OUTCOME_LABELS[outcome]}</Badge>;
}

export function DealStatusBadge({ status }: { status: string }) {
  const v = status === "won" ? "success" : status === "lost" || status === "abandoned" ? "destructive" : "secondary";
  return <Badge variant={v} className="capitalize">{status}</Badge>;
}
