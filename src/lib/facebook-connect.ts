import { and, eq } from "drizzle-orm";
import { schema, type DB } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { audit } from "./events";
import { newId, now } from "./ids";
import { getLocation } from "./queries";
import { recheckListing } from "./scan";
import { fbRow as row } from "./facebook-creds";
export { fbConnection } from "./facebook-creds";
import type { FbPageRef } from "./facebook";

/** Pages the user may choose from after login (kept encrypted until one is selected). */
export async function savePendingPages(db: DB, orgId: string, pages: FbPageRef[]) {
  const enc = await encryptSecret(JSON.stringify({ pending: pages }));
  const existing = await row(db, orgId);
  const v = { externalAccountId: null, status: "pending", capabilitiesJson: ["read"], encryptedCredentialReference: enc, expiresAt: null, lastSyncedAt: now() };
  if (existing) await db.update(schema.connections).set(v).where(eq(schema.connections.id, existing.id)).run();
  else await db.insert(schema.connections).values({ id: newId(), organizationId: orgId, platform: "facebook", ...v }).run();
}
export async function pendingPages(db: DB, orgId: string): Promise<FbPageRef[]> {
  const c = await row(db, orgId);
  if (!c || c.status !== "pending" || !c.encryptedCredentialReference) return [];
  try { return (JSON.parse(await decryptSecret(c.encryptedCredentialReference)) as { pending?: FbPageRef[] }).pending ?? []; } catch { return []; }
}

/** Connects one Page: stores its token, makes it a monitored listing, and reads it straight away. */
export async function selectPage(db: DB, orgId: string, userId: string, page: FbPageRef) {
  const enc = await encryptSecret(JSON.stringify({ pageId: page.id, name: page.name, token: page.token }));
  const existing = await row(db, orgId);
  const v = { externalAccountId: page.id, status: "connected", capabilitiesJson: ["read", "write", "verify"], encryptedCredentialReference: enc, expiresAt: null, lastSyncedAt: now() };
  if (existing) await db.update(schema.connections).set(v).where(eq(schema.connections.id, existing.id)).run();
  else await db.insert(schema.connections).values({ id: newId(), organizationId: orgId, platform: "facebook", ...v }).run();
  const loc = await getLocation(db, orgId);
  let listingId: string | null = null;
  if (loc) {
    const url = `https://www.facebook.com/${page.id}`;
    const have = await db.select().from(schema.listings).where(and(eq(schema.listings.locationId, loc.id), eq(schema.listings.url, url))).get();
    listingId = have?.id ?? newId();
    // The owner connected this Page themselves, so identity is certain; no matching needed.
    if (!have) await db.insert(schema.listings).values({ id: listingId, locationId: loc.id, platform: "facebook", externalListingId: page.id, url, identityConfidence: 1, status: "monitoring", discoveredAt: now() }).run();
    await recheckListing(db, listingId).catch(() => undefined);
  }
  await audit(db, orgId, userId, "connection.facebook_connected", { page: page.name, pageId: page.id });
  return { listingId };
}
