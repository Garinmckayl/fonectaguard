import { eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { HttpError, canWrite } from "@/lib/auth";
import { schema } from "@/lib/db";
import { audit } from "@/lib/events";
import { now } from "@/lib/ids";
import { ownLocation } from "@/lib/guards";
import { checkDomainOwnership } from "@/lib/verify";

export const POST = route(true, async ({ s, db, params }) => {
  if (!canWrite(s.role)) throw new HttpError(403, "Insufficient permissions");
  const loc = await ownLocation(db, s, params.id);
  if (!loc.website) throw new HttpError(400, "No website on file");
  const r = await checkDomainOwnership(loc.website, loc.id);
  if (r.ok) {
    await db.update(schema.businessLocations).set({ verificationStatus: "verified", updatedAt: now() }).where(eq(schema.businessLocations.id, loc.id)).run();
    await audit(db, s.orgId, s.userId, "business.ownership_verified", { id: loc.id, method: r.method });
  }
  return r;
});
