import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function isAuthorisedCron(header: string | null): boolean {
  const secret = env.cronSecret();
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
