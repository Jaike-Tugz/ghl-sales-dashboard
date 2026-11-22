"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/viewer";
import { isDemoMode } from "@/lib/data";
import { createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileAccount } from "@/lib/sync/reconcile";
import type { AccountRow } from "@/lib/ghl/auth";
import { BUSINESS_STAGE_ORDER } from "@/lib/settings-defaults";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

function demoGuard(): ActionState | null {
  return isDemoMode() ? { error: "Demo mode: connect Supabase (see SETUP.md) to save integration settings." } : null;
}

const accountSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    location_id: z.string().trim().regex(/^[A-Za-z0-9_-]{6,64}$/, "Location ID looks invalid"),
    auth_type: z.enum(["oauth", "private_integration"]),
    credential_env_var: z
      .string()
      .trim()
      .regex(/^GHL_PIT_[A-Z0-9_]{1,55}$/, "Env var name must look like GHL_PIT_ACCOUNT_1")
      .optional()
      .or(z.literal("")),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2a78d6"),
  })
  .refine((v) => v.auth_type === "oauth" || !!v.credential_env_var, { message: "Private integrations need the env var NAME that holds the token", path: ["credential_env_var"] });

/** Adds an account record. Only non-secret identifiers are accepted here — tokens never pass through a form. */
export async function addAccount(_: ActionState, form: FormData): Promise<ActionState> {
  await requireRole("admin");
  const guard = demoGuard();
  if (guard) return guard;
  const parsed = accountSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await createUserClient();
  const v = parsed.data;
  const { error } = await db.from("ghl_accounts").insert({
    name: v.name,
    location_id: v.location_id,
    auth_type: v.auth_type,
    credential_env_var: v.auth_type === "private_integration" ? v.credential_env_var : null,
    color: v.color,
  });
  if (error) return { error: error.code === "23505" ? "That location ID is already connected" : error.message };
  revalidatePath("/integrations");
  return { ok: true, message: "Account added. Connect it, then run a sync." };
}

export async function setAccountActive(accountId: string, active: boolean) {
  await requireRole("admin");
  if (isDemoMode()) return;
  const db = await createUserClient();
  await db.from("ghl_accounts").update({ active }).eq("id", z.string().uuid().parse(accountId));
  revalidatePath("/integrations");
}

/** Saves pipeline, stage and calendar mappings for one account (dashboard-side only). */
export async function saveMappings(_: ActionState, form: FormData): Promise<ActionState> {
  await requireRole("admin");
  const guard = demoGuard();
  if (guard) return guard;
  const accountId = z.string().uuid().parse(form.get("account_id"));
  const db = await createUserClient();
  const uuid = z.string().uuid();
  const errors: string[] = [];
  const salesPipes = new Set(form.getAll("sales_pipeline").map(String));
  const salesCals = new Set(form.getAll("sales_calendar").map(String));
  for (const [k, raw] of form.entries()) {
    const v = String(raw);
    if (k.startsWith("pipeline_seen:")) {
      const id = uuid.parse(k.slice(14));
      const r = await db.from("pipelines").update({ is_sales_pipeline: salesPipes.has(id) }).eq("id", id).eq("account_id", accountId);
      if (r.error) errors.push(r.error.message);
    } else if (k.startsWith("stage:")) {
      const id = uuid.parse(k.slice(6));
      const stage = v === "" ? null : z.enum(BUSINESS_STAGE_ORDER as [string, ...string[]]).parse(v);
      const r = await db.from("pipeline_stages").update({ business_stage: stage }).eq("id", id).eq("account_id", accountId);
      if (r.error) errors.push(r.error.message);
    } else if (k.startsWith("calnum:")) {
      const id = uuid.parse(k.slice(7));
      const n = v === "" ? null : z.coerce.number().int().min(1).max(9).parse(v);
      const r = await db.from("calendars").update({ call_number: n, is_sales_calendar: salesCals.has(id) }).eq("id", id).eq("account_id", accountId);
      if (r.error) errors.push(r.error.message);
    }
  }
  revalidatePath("/", "layout");
  return errors.length ? { error: errors[0] } : { ok: true, message: "Mappings saved. Metrics re-classify immediately." };
}

export async function syncNow(accountId: string): Promise<ActionState> {
  await requireRole("admin");
  const guard = demoGuard();
  if (guard) return guard;
  const db = createAdminClient();
  const { data: account } = await db.from("ghl_accounts").select("*").eq("id", z.string().uuid().parse(accountId)).single<AccountRow>();
  if (!account) return { error: "Account not found" };
  const r = await reconcileAccount(db, account, "manual");
  revalidatePath("/", "layout");
  return r.status === "failed" ? { error: r.warnings[0] } : { ok: true, message: `Sync ${r.status}: ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(", ")}` };
}
