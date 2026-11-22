"use client";
import { useTransition } from "react";
import { Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OUTCOME_LABELS } from "@/lib/settings-defaults";
import type { CallOutcome } from "@/lib/types";
import { setOutcomeOverride } from "@/app/actions/outcomes";
import { OutcomeBadge } from "./outcome-badge";

/**
 * Manual outcome workflow for when GHL's appointment status is missing or
 * wrong. Stored in the dashboard only — GHL is never modified.
 */
export function OutcomeCell({ appointmentId, outcome, date, editable }: { appointmentId: string; outcome: CallOutcome; date: string; editable: boolean }) {
  const [pending, start] = useTransition();
  const badge = (
    <span className="inline-flex items-center gap-1.5" data-pending={pending || undefined}>
      <OutcomeBadge outcome={outcome} />
      {editable && <Pencil className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100" />}
    </span>
  );
  return (
    <div className="group/cell flex flex-col gap-0.5">
      <span className="text-xs tabular">{date}</span>
      {editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger className="w-fit text-left outline-none" aria-label="Record outcome">
            {badge}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Record outcome (dashboard only)</DropdownMenuLabel>
            {(["completed", "no_show", "cancelled", "rescheduled"] as CallOutcome[]).map((o) => (
              <DropdownMenuItem key={o} onSelect={() => start(() => setOutcomeOverride(appointmentId, o))}>
                {OUTCOME_LABELS[o]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => start(() => setOutcomeOverride(appointmentId, null))}>Use GHL status</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        badge
      )}
    </div>
  );
}
