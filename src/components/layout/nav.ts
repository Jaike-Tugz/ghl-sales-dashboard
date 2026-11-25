import { BellRing, ChartLine, Filter, LayoutDashboard, ListChecks, Phone, Plug, Settings, Trophy, Users } from "lucide-react";
import type { Role } from "@/lib/types";

export const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, roles: ["admin", "manager", "rep"] },
  { href: "/pipeline", label: "Pipeline", icon: ListChecks, roles: ["admin", "manager", "rep"] },
  { href: "/funnel", label: "Sales Funnel", icon: Filter, roles: ["admin", "manager", "rep"] },
  { href: "/calls", label: "Sales Calls", icon: Phone, roles: ["admin", "manager", "rep"] },
  { href: "/leads", label: "Leads", icon: Users, roles: ["admin", "manager", "rep"] },
  { href: "/team", label: "Sales Team", icon: Trophy, roles: ["admin", "manager", "rep"] },
  { href: "/analytics", label: "Analytics", icon: ChartLine, roles: ["admin", "manager", "rep"] },
  { href: "/follow-ups", label: "Follow-Ups", icon: BellRing, roles: ["admin", "manager", "rep"] },
  { href: "/integrations", label: "Integrations", icon: Plug, roles: ["admin", "manager"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin", "manager", "rep"] },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: unknown; roles: readonly Role[] }>;

/** Query keys carried across pages so the global account/date selection sticks. */
export const GLOBAL_KEYS = ["account", "range", "from", "to"] as const;
