import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { schema, type DB } from "./db";
import { locationHealth } from "./scan";

export function getLocation(db: DB, orgId: string) {
  return db.select().from(schema.businessLocations).where(eq(schema.businessLocations.organizationId, orgId)).get();
}

export function loadListingsWithStats(db: DB, locationId: string) {
  const ls = db.select().from(schema.listings).where(eq(schema.listings.locationId, locationId)).all();
  return ls.map((l) => {
    const discs = db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.listingId, l.id), notInArray(schema.discrepancies.status, ["resolved", "dismissed"]))).all();
    return { ...l, discrepancies: discs, worst: (["critical", "high", "medium", "low"] as const).find((s) => discs.some((d) => d.severity === s)) ?? null };
  });
}

export function dashboardData(db: DB, orgId: string) {
  const loc = getLocation(db, orgId);
  if (!loc) return null;
  const listings = loadListingsWithStats(db, loc.id);
  const health = locationHealth(db, loc.id);
  const active = db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.locationId, loc.id), notInArray(schema.discrepancies.status, ["resolved", "dismissed"]))).orderBy(desc(schema.discrepancies.firstDetectedAt)).all();
  const resolved = db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.locationId, loc.id), eq(schema.discrepancies.status, "resolved"))).all();
  const snapshots = db.select().from(schema.healthSnapshots).where(eq(schema.healthSnapshots.locationId, loc.id)).orderBy(schema.healthSnapshots.recordedAt).all();
  const lastScan = db.select().from(schema.scanRuns).where(and(eq(schema.scanRuns.locationId, loc.id), eq(schema.scanRuns.status, "completed"))).orderBy(desc(schema.scanRuns.completedAt)).get();
  const approvals = active.length ? db.select().from(schema.repairProposals).where(and(inArray(schema.repairProposals.discrepancyId, active.map((d) => d.id)), eq(schema.repairProposals.status, "awaiting_approval"))).all() : [];
  const events = db.select().from(schema.agentEvents).where(eq(schema.agentEvents.organizationId, orgId)).orderBy(desc(schema.agentEvents.createdAt)).limit(12).all();
  return { loc, listings, health, active, resolved, snapshots, lastScan, approvals, events };
}

const SEV = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
export const bySeverity = <T extends { severity: string }>(a: T[]) => [...a].sort((x, y) => SEV[x.severity] - SEV[y.severity]);
