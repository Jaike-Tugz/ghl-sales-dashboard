"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser client for sign-in only. Uses the public anon key; RLS applies. */
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
