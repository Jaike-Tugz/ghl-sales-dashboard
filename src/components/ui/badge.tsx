import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3", {
  variants: {
    variant: {
      default: "border-transparent bg-secondary text-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      success: "border-transparent bg-success/15 text-success",
      warning: "border-transparent bg-warning/15 text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]",
      destructive: "border-transparent bg-destructive/12 text-destructive",
      outline: "text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
