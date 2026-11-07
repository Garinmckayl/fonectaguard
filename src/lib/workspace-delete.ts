import { eq, inArray } from "drizzle-orm";
import { schema, type DB } from "./db";

/** Permanently deletes everything stored for one workspace: business data, scans, AI audits and reports, stored tokens, the member and the user. */
export async function deleteWorkspace(db: DB, orgId: string, userId: string) {
  const locs = (await db.select({ id: schema.businessLocations.id }).from(schema.businessLocations).where(eq(schema.businessLocations.organizationId, orgId)).all()).map((l) => l.id);
  if (locs.length) {
    const lists = (await db.select({ id: schema.listings.id }).from(schema.listings).where(inArray(schema.listings.locationId, locs)).all()).map((l) => l.id);
    const discs = (await db.select({ id: schema.discrepancies.id }).from(schema.discrepancies).where(inArray(schema.discrepancies.locationId, locs)).all()).map((d) => d.id);
    const audits = (await db.select({ id: schema.aiAudits.id }).from(schema.aiAudits).where(inArray(schema.aiAudits.locationId, locs)).all()).map((a) => a.id);
    if (discs.length) {
      const props = (await db.select({ id: schema.repairProposals.id }).from(schema.repairProposals).where(inArray(schema.repairProposals.discrepancyId, discs)).all()).map((p) => p.id);
      if (props.length) await db.delete(schema.repairAttempts).where(inArray(schema.repairAttempts.proposalId, props)).run();
      await db.delete(schema.repairProposals).where(inArray(schema.repairProposals.discrepancyId, discs)).run();
    }
    if (lists.length) await db.delete(schema.listingObservations).where(inArray(schema.listingObservations.listingId, lists)).run();
    if (audits.length) await db.delete(schema.aiAuditAnswers).where(inArray(schema.aiAuditAnswers.auditId, audits)).run();
    await db.delete(schema.aiAudits).where(inArray(schema.aiAudits.locationId, locs)).run();
    await db.delete(schema.discrepancies).where(inArray(schema.discrepancies.locationId, locs)).run();
    await db.delete(schema.listings).where(inArray(schema.listings.locationId, locs)).run();
    await db.delete(schema.scanRuns).where(inArray(schema.scanRuns.locationId, locs)).run();
    await db.delete(schema.healthSnapshots).where(inArray(schema.healthSnapshots.locationId, locs)).run();
    await db.delete(schema.canonicalFieldVersions).where(inArray(schema.canonicalFieldVersions.locationId, locs)).run();
    await db.delete(schema.businessLocations).where(eq(schema.businessLocations.organizationId, orgId)).run();
  }
  await db.delete(schema.agentEvents).where(eq(schema.agentEvents.organizationId, orgId)).run();
  await db.delete(schema.auditLogs).where(eq(schema.auditLogs.organizationId, orgId)).run();
  await db.delete(schema.connections).where(eq(schema.connections.organizationId, orgId)).run();
  await db.delete(schema.notifications).where(eq(schema.notifications.userId, userId)).run();
  await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, orgId)).run();
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId)).run();
  await db.delete(schema.users).where(eq(schema.users.id, userId)).run();
}
