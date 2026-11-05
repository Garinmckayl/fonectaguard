import { desc, eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { schema } from "@/lib/db";
import { ownLocation } from "@/lib/guards";

export const GET = route(false, ({ s, db, params }) => {
  ownLocation(db, s, params.id);
  return db.select().from(schema.scanRuns).where(eq(schema.scanRuns.locationId, params.id)).orderBy(desc(schema.scanRuns.startedAt)).limit(50).all();
});
