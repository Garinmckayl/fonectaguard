import { asc, eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { schema } from "@/lib/db";
import { ownLocation } from "@/lib/guards";

export const GET = route(false, async ({ s, db, params }) => {
  const scan = (await db.select().from(schema.scanRuns).where(eq(schema.scanRuns.id, params.id)).get());
  if (!scan) throw new HttpError(404, "Not found");
  await ownLocation(db, s, scan.locationId);
  const events = (await db.select().from(schema.agentEvents).where(eq(schema.agentEvents.scanRunId, scan.id)).orderBy(asc(schema.agentEvents.createdAt)).all());
  return { scan, events };
});
