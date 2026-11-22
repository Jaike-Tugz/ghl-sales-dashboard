"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEMO_VIEW_COOKIE } from "@/lib/auth/viewer";
import { isDemoMode } from "@/lib/data";

export async function switchDemoPersona(persona: "admin" | "manager" | "rep") {
  if (!isDemoMode()) throw new Error("Personas are only available in demo mode");
  if (!["admin", "manager", "rep"].includes(persona)) throw new Error("Unknown persona");
  (await cookies()).set(DEMO_VIEW_COOKIE, persona, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
