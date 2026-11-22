"use client";
import { useQueryNav } from "@/components/layout/use-query-nav";
import { cn } from "@/lib/utils";

export function GranularityToggle({ value }: { value: string }) {
  const { set } = useQueryNav();
  return (
    <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Granularity">
      {(["day", "week", "month"] as const).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => set({ granularity: g })}
          className={cn("rounded-md px-3 py-1 text-xs font-medium capitalize text-muted-foreground", value === g && "bg-card text-foreground shadow-sm")}
        >
          {g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
        </button>
      ))}
    </div>
  );
}
