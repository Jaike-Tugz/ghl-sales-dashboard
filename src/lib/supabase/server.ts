import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, requireEnv } from "../env";

/**
 * Supabase client bound to the signed-in user's session. Every read through
 * this client is subject to Row Level Security — use it for all dashboard
 * data so the database, not the UI, decides what a user may see.
 */
export async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(requireEnv(env.supabaseUrl(), "NEXT_PUBLIC_SUPABASE_URL"), requireEnv(env.supabaseAnonKey(), "NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component — the proxy refreshes the session instead.
        }
      },
    },
  });
}
