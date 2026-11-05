import { desc, eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { schema } from "@/lib/db";
import { ownLocation } from "@/lib/guards";

export const GET = route(false, async ({ s, db, params }) => {
  await ownLocation(db, s, params.id);
  return (await db.select().from(schema.scanRuns).where(eq(schema.scanRuns.locationId, params.id)).orderBy(desc(schema.scanRuns.startedAt)).limit(50).all());
});
