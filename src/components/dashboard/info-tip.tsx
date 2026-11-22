"use client";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" className="text-muted-foreground/70 hover:text-foreground" aria-label="How this is calculated">
            <Info className="size-3.5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="z-50 max-w-72 rounded-md border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md">
            {text}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
