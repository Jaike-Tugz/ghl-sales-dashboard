"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage, requireViewer } from "@/lib/auth/viewer";
import { isDemoMode, setDemoOutcome } from "@/lib/data";
import { createUserClient } from "@/lib/supabase/server";
import { CALL_OUTCOMES } from "@/lib/types";

const schema = z.object({ id: z.string().min(1).max(64), outcome: z.enum(CALL_OUTCOMES as [string, ...string[]]).nullable() });

/** Writes only to our appointments.outcome_override column (RLS: admin/manager of that account). */
export async function setOutcomeOverride(appointmentId: string, outcome: string | null) {
  const viewer = await requireViewer();
  if (!canManage(viewer)) throw new Error("Only admins and managers can record outcomes");
  const { id, outcome: o } = schema.parse({ id: appointmentId, outcome });
  if (isDemoMode()) {
    setDemoOutcome(id, o as never);
  } else {
    const db = await createUserClient();
    const { error, count } = await db
      .from("appointments")
      .update({ outcome_override: o, outcome_override_by: o ? viewer.userId : null, outcome_override_at: o ? new Date().toISOString() : null }, { count: "exact" })
      .eq("id", id);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Appointment not found or not permitted");
  }
  revalidatePath("/", "layout");
}
