import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "../env";
import { createUserClient } from "../supabase/server";
import type { Role, Viewer } from "../types";

export const DEMO_VIEW_COOKIE = "demo_view";

/** Demo-mode personas so RBAC can be exercised before Supabase is connected. */
export const DEMO_PERSONAS: Record<string, Omit<Viewer, "isDemo">> = {
  admin: { userId: "demo-admin", email: "admin@demo.local", name: "Demo Admin", role: "admin", accountIds: "all", repIds: [] },
  manager: { userId: "demo-manager", email: "manager@demo.local", name: "Demo Manager (Accounts 1–2)", role: "manager", accountIds: ["acc_1", "acc_2"], repIds: [] },
  rep: {
    userId: "demo-rep",
    email: "sarah@example.com",
    name: "Sarah Mitchell (Rep)",
    role: "rep",
    accountIds: ["acc_1", "acc_2"],
    repIds: ["rep_acc_1_sarah", "rep_acc_2_sarah"],
  },
};

/**
 * Who is looking. In Supabase mode this comes from the verified session
 * (getUser re-validates the JWT with Supabase) and the user_profiles row —
 * the same facts RLS uses. Cached per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (env.dataSource() === "mock") {
    const jar = await cookies();
    const persona = DEMO_PERSONAS[jar.get(DEMO_VIEW_COOKIE)?.value ?? "admin"] ?? DEMO_PERSONAS.admin;
    return { ...persona, isDemo: true };
  }
  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase.from("user_profiles").select("id, email, full_name, role, active").eq("id", auth.user.id).maybeSingle();
  if (!profile || !profile.active) {
    return { userId: auth.user.id, email: auth.user.email ?? "", name: profile?.full_name ?? auth.user.email ?? "", role: "rep", accountIds: [], repIds: [], isDemo: false, inactive: true } as Viewer & { inactive: true };
  }
  const role = profile.role as Role;
  let accountIds: Viewer["accountIds"] = "all";
  let repIds: string[] = [];
  if (role !== "admin") {
    const { data: reps } = await supabase.from("sales_reps").select("id, account_id").eq("user_id", auth.user.id);
    repIds = (reps ?? []).map((r) => r.id);
    if (role === "manager") {
      const { data: access } = await supabase.from("user_account_access").select("account_id").eq("user_id", auth.user.id);
      accountIds = (access ?? []).map((a) => a.account_id);
    } else accountIds = [...new Set((reps ?? []).map((r) => r.account_id as string))];
  }
  return { userId: auth.user.id, email: profile.email, name: profile.full_name ?? profile.email, role, accountIds, repIds, isDemo: false };
});

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if ((v as Viewer & { inactive?: boolean }).inactive) redirect("/pending");
  return v;
}

export async function requireRole(...roles: Role[]): Promise<Viewer> {
  const v = await requireViewer();
  if (!roles.includes(v.role)) redirect("/?denied=1");
  return v;
}

export const canManage = (v: Viewer) => v.role === "admin" || v.role === "manager";
