"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/viewer";
import { getSettings, isDemoMode, setDemoSettings } from "@/lib/data";
import { createUserClient } from "@/lib/supabase/server";
import { BUSINESS_STAGE_ORDER } from "@/lib/settings-defaults";
import { isValidTimeZone } from "@/lib/time";
import { CALL_OUTCOMES, type AppSettings, type CallOutcome } from "@/lib/types";
import type { ActionState } from "./integrations";

const outcome = z.enum(CALL_OUTCOMES as [CallOutcome, ...CallOutcome[]]);

export async function saveSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole("admin");
  const current = await getSettings();
  const tz = String(form.get("reportingTimezone") ?? "").trim();
  if (!isValidTimeZone(tz)) return { error: `Unknown IANA timezone "${tz}"` };
  const parsed = z
    .object({
      grace: z.coerce.number().int().min(0).max(1440),
      showed: outcome,
      noshow: outcome,
      cancelled: outcome,
      pastUnconfirmed: outcome,
    })
    .safeParse({
      grace: form.get("grace"),
      showed: form.get("om_showed"),
      noshow: form.get("om_noshow"),
      cancelled: form.get("om_cancelled"),
      pastUnconfirmed: form.get("om_pastUnconfirmed"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const next: AppSettings = {
    reportingTimezone: tz,
    pendingOutcomeGraceMinutes: parsed.data.grace,
    abandonedCountsAsLost: form.get("abandonedCountsAsLost") === "on",
    outcomeMapping: {
      showed: parsed.data.showed,
      noshow: parsed.data.noshow,
      cancelled: parsed.data.cancelled,
      pastUnconfirmed: parsed.data.pastUnconfirmed,
      excludeInvalid: form.get("excludeInvalid") === "on",
    },
    funnelStages: BUSINESS_STAGE_ORDER.map((key, i) => ({
      key,
      label: String(form.get(`label_${key}`) ?? "").trim().slice(0, 40) || current.funnelStages.find((s) => s.key === key)!.label,
      // New lead and closing anchor the funnel and are always on.
      enabled: key === "new_lead" || key === "closing" ? true : form.get(`enabled_${key}`) === "on",
      position: i,
    })),
    followUpRules: current.followUpRules.map((r) => ({
      ...r,
      enabled: form.get(`rule_enabled_${r.key}`) === "on",
      thresholdDays: Math.max(0, Math.min(365, Number(form.get(`rule_days_${r.key}`)) || r.thresholdDays)),
    })),
  };
  if (isDemoMode()) {
    setDemoSettings(next);
  } else {
    const db = await createUserClient();
    const { error } = await db
      .from("app_settings")
      .update({
        reporting_timezone: next.reportingTimezone,
        funnel_stages: next.funnelStages,
        outcome_mapping: next.outcomeMapping,
        abandoned_counts_as_lost: next.abandonedCountsAsLost,
        pending_outcome_grace_minutes: next.pendingOutcomeGraceMinutes,
        updated_at: new Date().toISOString(),
        updated_by: viewer.userId,
      })
      .eq("id", 1);
    if (error) return { error: error.message };
    for (const r of next.followUpRules) {
      const res = await db.from("follow_up_rules").update({ enabled: r.enabled, threshold_days: r.thresholdDays, updated_at: new Date().toISOString() }).eq("key", r.key);
      if (res.error) return { error: res.error.message };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, message: isDemoMode() ? "Saved for this demo session (in memory)." : "Settings saved." };
}

export async function updateUser(_: ActionState, form: FormData): Promise<ActionState> {
  await requireRole("admin");
  if (isDemoMode()) return { error: "Demo mode: user management needs Supabase." };
  const v = z
    .object({ user_id: z.string().uuid(), role: z.enum(["admin", "manager", "rep"]), active: z.boolean() })
    .safeParse({ user_id: form.get("user_id"), role: form.get("role"), active: form.get("active") === "on" });
  if (!v.success) return { error: v.error.issues[0]?.message };
  const accounts = form.getAll("account").map(String).filter((x) => z.string().uuid().safeParse(x).success);
  const reps = form.getAll("rep").map(String).filter((x) => z.string().uuid().safeParse(x).success);
  const db = await createUserClient();
  const { error } = await db.from("user_profiles").update({ role: v.data.role, active: v.data.active }).eq("id", v.data.user_id);
  if (error) return { error: error.message };
  await db.from("user_account_access").delete().eq("user_id", v.data.user_id);
  if (v.data.role === "manager" && accounts.length) {
    const r = await db.from("user_account_access").insert(accounts.map((account_id) => ({ user_id: v.data.user_id, account_id })));
    if (r.error) return { error: r.error.message };
  }
  // Link GHL sales-rep identities to this login (drives what a rep can see).
  await db.from("sales_reps").update({ user_id: null }).eq("user_id", v.data.user_id);
  if (reps.length) {
    const r = await db.from("sales_reps").update({ user_id: v.data.user_id }).in("id", reps);
    if (r.error) return { error: r.error.message };
  }
  revalidatePath("/settings");
  return { ok: true, message: "User updated." };
}
