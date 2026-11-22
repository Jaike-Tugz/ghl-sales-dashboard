import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, dataSource: env.dataSource(), time: new Date().toISOString() });
}
