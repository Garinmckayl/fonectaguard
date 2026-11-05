import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { enqueueDueScans } from "@/lib/scan";

// Scheduled entry point (Cloudflare Cron Trigger / external scheduler). Independent of user sessions.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ started: (await enqueueDueScans(await getDb())).length });
}
