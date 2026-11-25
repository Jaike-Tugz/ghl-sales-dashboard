import { LayoutDashboard, ListChecks, Megaphone, Plug, Settings } from "lucide-react";
import type { Role } from "@/lib/types";

export const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, roles: ["admin", "manager", "rep"] },
  { href: "/pipeline", label: "Lead Progress", icon: ListChecks, roles: ["admin", "manager", "rep"] },
  { href: "/fb-ads", label: "FB Ads", icon: Megaphone, roles: ["admin", "manager", "rep"] },
  { href: "/integrations", label: "Integrations", icon: Plug, roles: ["admin", "manager"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin", "manager", "rep"] },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: unknown; roles: readonly Role[] }>;

/** Query keys carried across pages so the global account/date selection sticks. */
export const GLOBAL_KEYS = ["account", "range", "from", "to"] as const;
