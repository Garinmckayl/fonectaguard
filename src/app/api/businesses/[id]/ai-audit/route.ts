import { desc, eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { ownLocation } from "@/lib/guards";
import { schema } from "@/lib/db";
import { now } from "@/lib/ids";
import { startAiAudit, finalizeAudit } from "@/lib/ai-audit";

export const maxDuration = 120;

// Starts an audit and returns at once; the page polls. On Cloudflare each assistant runs as its own queue job.
export const POST = route(true, async ({ s, db, params }) => {
  const loc = await ownLocation(db, s, params.id);
  let last = (await db.select().from(schema.aiAudits).where(eq(schema.aiAudits.locationId, loc.id)).orderBy(desc(schema.aiAudits.startedAt)).get());
  // Each audit costs model calls: block overlapping runs and rapid repeats.
  if (last?.status === "running" && now() - last.startedAt >= 3 * 60_000) { await finalizeAudit(db, last.id, true); last = (await db.select().from(schema.aiAudits).where(eq(schema.aiAudits.id, last.id)).get()) ?? last; } // a lost job must not block new audits
  if (last && ((last.status === "running" && now() - last.startedAt < 3 * 60_000) || now() - last.startedAt < 30_000)) throw new HttpError(429, "An audit just ran. Wait a moment before running another.");
  try {
    return await startAiAudit(db, loc.id);
  } catch (e) {
    if (e instanceof Error && /OPENROUTER_API_KEY|verified/.test(e.message)) throw new HttpError(400, e.message);
    throw e;
  }
});
