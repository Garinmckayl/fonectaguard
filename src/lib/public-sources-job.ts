import { eq } from "drizzle-orm";
import { getCfEnv, schema, type DB } from "./db";
import { loadCanonical } from "./canonical";
import { gatherPublicSources } from "./public-sources";

/** Runs the open-data lookups for one public check and stores them on the audit. A failure still stores an empty result so the report stops waiting. */
export async function runPublicSources(db: DB, auditId: string) {
  const audit = (await db.select().from(schema.aiAudits).where(eq(schema.aiAudits.id, auditId)).get());
  if (!audit || audit.publicSourcesJson) return;
  const loc = (await db.select().from(schema.businessLocations).where(eq(schema.businessLocations.id, audit.locationId)).get());
  let result: unknown = { osm: null, registry: null, directory: null };
  if (loc?.website) {
    const c = await loadCanonical(db, loc.id);
    result = await gatherPublicSources({ name: loc.businessName, city: loc.city, website: loc.website, address: c.address ? String(c.address.value) : undefined, phone: c.phone ? String(c.phone.value) : undefined, hours: c.hours?.value, country: loc.country ?? undefined }).catch(() => result);
  }
  await db.update(schema.aiAudits).set({ publicSourcesJson: result }).where(eq(schema.aiAudits.id, auditId)).run();
}

/** On Cloudflare: its own queue message (own subrequest budget). Locally and in tests: inline. */
export async function enqueuePublicSources(db: DB, auditId: string) {
  const env = await getCfEnv().catch(() => null);
  if (env?.SCAN_QUEUE) { await env.SCAN_QUEUE.send({ kind: "public_sources", auditId, locationId: "", scanId: auditId, paceMs: 0, trigger: "manual" }); return; }
  await runPublicSources(db, auditId);
}
