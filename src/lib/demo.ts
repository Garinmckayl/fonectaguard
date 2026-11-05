import { eq, inArray } from "drizzle-orm";
import { schema, type DB } from "./db";
import { newId, now } from "./ids";
import { verifyProfile } from "./canonical";

export const DEMO = {
  name: "Northstar Coffee — Turku",
  phone: "+358 40 123 4567",
  street: "Demo Street 12",
  city: "Turku",
  hours: "08:00–22:00",
  path: "/demo-site/northstar",
};
export const demoSiteUrl = () => `${process.env.APP_URL ?? "http://localhost:3000"}${DEMO.path}`;

/** Intentionally drifted, fictional third-party listings. */
function demoListingRows(orgId: string) {
  const site = demoSiteUrl();
  return [
    { platform: "DemoMaps", slug: "demomaps-northstar", name: DEMO.name, address: `${DEMO.street}, ${DEMO.city}`, phone: "+358 40 123 9876", hours: DEMO.hours, website: site },
    { platform: "DemoYellow", slug: "demoyellow-northstar", name: DEMO.name, address: `${DEMO.street}, ${DEMO.city}`, phone: DEMO.phone, hours: "08:00–20:00", website: site },
    { platform: "DemoPages", slug: "demopages-northstar", name: DEMO.name, address: "Old Road 3, Turku", phone: DEMO.phone, hours: DEMO.hours, website: site },
    // Unrelated business with a similar name: must be rejected by identity matching.
    { platform: "DemoMaps", slug: "demomaps-northstar-roasters-oulu", name: "Northstar Coffee Roasters", address: "Kahvikatu 1, Oulu", phone: "+358 40 555 0000", hours: "09:00–17:00", website: "http://northstar-roasters.example" },
  ].map((r) => ({ id: newId(), organizationId: orgId, updatedAt: now(), ...r }));
}

export function seedDemo(db: DB, userId: string, orgId: string) {
  const locId = newId();
  db.insert(schema.businessLocations).values({
    id: locId, organizationId: orgId, businessName: DEMO.name, website: demoSiteUrl(), country: "FI", city: DEMO.city,
    addressJson: { street: DEMO.street, city: DEMO.city }, phone: DEMO.phone, email: "hello@northstar-coffee.example", category: "Coffee shop",
    description: "Fictional demo business.", timezone: "Europe/Helsinki", verificationStatus: "unverified", monitoringFrequency: "daily", nextScanAt: now() + 86400e3, createdAt: now(), updatedAt: now(),
  }).run();
  verifyProfile(db, locId, userId, { name: DEMO.name, address: `${DEMO.street}, ${DEMO.city}`, phone: DEMO.phone, hours: DEMO.hours, website: demoSiteUrl() }, "demo_seed");
  db.insert(schema.demoListings).values(demoListingRows(orgId)).run();
  db.insert(schema.connections).values({ id: newId(), organizationId: orgId, platform: "demo", externalAccountId: "demo-account", status: "connected", capabilitiesJson: ["read", "write", "verify"], expiresAt: null, lastSyncedAt: null }).onConflictDoNothing().run();
  return locId;
}

/** Removes every location-scoped record of the demo org and reseeds. Refuses non-demo organizations. */
export function resetDemo(db: DB, userId: string, orgId: string) {
  const org = db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).get();
  if (!org?.isDemo) throw new Error("Reset is only available in the demo environment");
  const locs = db.select({ id: schema.businessLocations.id }).from(schema.businessLocations).where(eq(schema.businessLocations.organizationId, orgId)).all().map((l) => l.id);
  if (locs.length) {
    const lists = db.select({ id: schema.listings.id }).from(schema.listings).where(inArray(schema.listings.locationId, locs)).all().map((l) => l.id);
    const discs = db.select({ id: schema.discrepancies.id }).from(schema.discrepancies).where(inArray(schema.discrepancies.locationId, locs)).all().map((d) => d.id);
    if (discs.length) {
      const props = db.select({ id: schema.repairProposals.id }).from(schema.repairProposals).where(inArray(schema.repairProposals.discrepancyId, discs)).all().map((p) => p.id);
      if (props.length) db.delete(schema.repairAttempts).where(inArray(schema.repairAttempts.proposalId, props)).run();
      db.delete(schema.repairProposals).where(inArray(schema.repairProposals.discrepancyId, discs)).run();
    }
    if (lists.length) db.delete(schema.listingObservations).where(inArray(schema.listingObservations.listingId, lists)).run();
    db.delete(schema.discrepancies).where(inArray(schema.discrepancies.locationId, locs)).run();
    db.delete(schema.listings).where(inArray(schema.listings.locationId, locs)).run();
    db.delete(schema.scanRuns).where(inArray(schema.scanRuns.locationId, locs)).run();
    db.delete(schema.healthSnapshots).where(inArray(schema.healthSnapshots.locationId, locs)).run();
    db.delete(schema.canonicalFieldVersions).where(inArray(schema.canonicalFieldVersions.locationId, locs)).run();
  }
  db.delete(schema.businessLocations).where(eq(schema.businessLocations.organizationId, orgId)).run();
  db.delete(schema.demoListings).where(eq(schema.demoListings.organizationId, orgId)).run();
  db.delete(schema.agentEvents).where(eq(schema.agentEvents.organizationId, orgId)).run();
  db.delete(schema.notifications).where(eq(schema.notifications.userId, userId)).run();
  db.delete(schema.connections).where(eq(schema.connections.organizationId, orgId)).run();
  return seedDemo(db, userId, orgId);
}

export function createDemoUser(db: DB) {
  const email = "demo@fonectaguard.example";
  let user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (user) {
    const m = db.select().from(schema.organizationMembers).where(eq(schema.organizationMembers.userId, user.id)).get()!;
    return { userId: user.id, orgId: m.organizationId };
  }
  const userId = newId(), orgId = newId();
  db.insert(schema.users).values({ id: userId, name: "Demo Owner", email, createdAt: now() }).run();
  db.insert(schema.organizations).values({ id: orgId, name: "Northstar Coffee (Demo)", ownerUserId: userId, isDemo: 1, createdAt: now() }).run();
  db.insert(schema.organizationMembers).values({ id: newId(), organizationId: orgId, userId, role: "owner" }).run();
  seedDemo(db, userId, orgId);
  return { userId, orgId };
}
