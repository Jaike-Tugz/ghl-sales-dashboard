import Image from "next/image";
import { cn } from "@/lib/utils";

/** KeepUp Media wordmark (black on transparent); inverted in dark mode. */
export function Logo({ className }: { className?: string }) {
  return <Image src="/keepup-logo.png" alt="KeepUp Media" width={384} height={64} priority className={cn("h-6 w-auto dark:invert", className)} />;
}
