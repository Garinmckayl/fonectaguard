import { and, eq } from "drizzle-orm";
import { HttpError, type Session } from "./auth";
import { schema, type DB } from "./db";

export async function ownLocation(db: DB, s: Session, id: string) {
  const l = (await db.select().from(schema.businessLocations).where(and(eq(schema.businessLocations.id, id), eq(schema.businessLocations.organizationId, s.orgId))).get());
  if (!l) throw new HttpError(404, "Not found");
  return l;
}

export async function ownListing(db: DB, s: Session, id: string) {
  const l = (await db.select().from(schema.listings).where(eq(schema.listings.id, id)).get());
  if (!l) throw new HttpError(404, "Not found");
  await ownLocation(db, s, l.locationId);
  return l;
}

export async function ownDiscrepancy(db: DB, s: Session, id: string) {
  const d = (await db.select().from(schema.discrepancies).where(eq(schema.discrepancies.id, id)).get());
  if (!d) throw new HttpError(404, "Not found");
  await ownLocation(db, s, d.locationId);
  return d;
}
