import { and, desc, eq } from "drizzle-orm";
import { schema, type DB } from "./db";
import { newId, now } from "./ids";
import type { FieldName } from "./compare";
import { normalizePhone, normalizeUrl, parseHours } from "./normalize";

export interface CanonicalField { value: unknown; versionId: string; version: number; verifiedAt: number; source: string }
/** Facts read from a public website are references only until the owner confirms them. */
export const UNCONFIRMED_SOURCE = "website_unverified";
export const isUnconfirmed = (f?: CanonicalField) => f?.source === UNCONFIRMED_SOURCE;
export type Canonical = Partial<Record<FieldName, CanonicalField>>;

export async function loadCanonical(db: DB, locationId: string): Promise<Canonical> {
  const rows = (await db.select().from(schema.canonicalFieldVersions).where(eq(schema.canonicalFieldVersions.locationId, locationId)).orderBy(desc(schema.canonicalFieldVersions.version)).all());
  const out: Canonical = {};
  for (const r of rows) {
    const f = r.fieldName as FieldName;
    if (!out[f]) out[f] = { value: r.normalizedValueJson, versionId: r.id, version: r.version, verifiedAt: r.verifiedAt, source: r.verificationSource };
  }
  return out;
}

/** Normalises an owner-confirmed value into canonical form; returns null if invalid. */
export function normalizeCanonicalValue(field: FieldName, raw: string): unknown | null {
  const v = raw.trim();
  if (!v) return null;
  if (field === "phone") return normalizePhone(v);
  if (field === "hours") return parseHours(v);
  if (field === "website") return normalizeUrl(v) ? v : null;
  return v;
}

/** Records owner-verified canonical values as new versions. AI suggestions never reach here without explicit confirmation. */
export async function verifyProfile(db: DB, locationId: string, userId: string, fields: Partial<Record<FieldName, string>>, source = "owner_confirmed") {
  const written: FieldName[] = [];
  for (const [k, raw] of Object.entries(fields) as [FieldName, string][]) {
    const value = normalizeCanonicalValue(k, raw);
    if (value === null) throw new Error(`Invalid value for ${k}`);
    const latest = (await db.select().from(schema.canonicalFieldVersions).where(and(eq(schema.canonicalFieldVersions.locationId, locationId), eq(schema.canonicalFieldVersions.fieldName, k))).orderBy(desc(schema.canonicalFieldVersions.version)).get());
    // An unchanged value is skipped, unless it is being upgraded from "read from a website" to "confirmed by the owner".
    if (latest && JSON.stringify(latest.normalizedValueJson) === JSON.stringify(value) && latest.verificationSource === source) continue;
    (await db.insert(schema.canonicalFieldVersions).values({ id: newId(), locationId, fieldName: k, normalizedValueJson: value, verifiedBy: userId, verificationSource: source, verifiedAt: now(), version: (latest?.version ?? 0) + 1 }).run());
    written.push(k);
  }
  if (written.length) (await db.update(schema.businessLocations).set({ updatedAt: now() }).where(eq(schema.businessLocations.id, locationId)).run());
  return written;
}
