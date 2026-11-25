import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border bg-card px-3 py-1 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
