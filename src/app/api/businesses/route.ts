import { eq } from "drizzle-orm";
import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError, canWrite } from "@/lib/auth";
import { verifyProfile } from "@/lib/canonical";
import { schema } from "@/lib/db";
import { audit } from "@/lib/events";
import { newId, now } from "@/lib/ids";

export const GET = route(false, async ({ s, db }) => (await db.select().from(schema.businessLocations).where(eq(schema.businessLocations.organizationId, s.orgId)).all()));

const Body = z.object({
  businessName: z.string().min(1).max(200), website: z.string().url(), country: z.string().max(2).default("FI"), city: z.string().min(1).max(100),
  address: z.string().max(300).optional(), phone: z.string().max(40).optional(), email: z.string().email().optional(), hours: z.string().max(300).optional(),
  category: z.string().max(100).optional(),
  // Field names the owner explicitly confirmed; only these become verified canonical values.
  confirm: z.array(z.enum(["name", "address", "phone", "hours", "website", "email"])).default([]),
});

export const POST = route(true, async ({ s, db, req }) => {
  if (!canWrite(s.role)) throw new HttpError(403, "Insufficient permissions");
  const b = Body.parse(await req.json());
  const id = newId();
  (await db.insert(schema.businessLocations).values({ id, organizationId: s.orgId, businessName: b.businessName, website: b.website, country: b.country, city: b.city, addressJson: b.address ? { street: b.address, city: b.city } : null, phone: b.phone ?? null, email: b.email ?? null, category: b.category ?? null, nextScanAt: now() + 86400e3, createdAt: now(), updatedAt: now() }).run());
  const vals: Record<string, string | undefined> = { name: b.businessName, address: b.address, phone: b.phone, hours: b.hours, website: b.website, email: b.email };
  const fields = Object.fromEntries(b.confirm.filter((f) => vals[f]).map((f) => [f, vals[f]!]));
  try { await verifyProfile(db, id, s.userId, fields); } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "Invalid profile"); }
  await audit(db, s.orgId, s.userId, "business.created", { id, confirmed: Object.keys(fields) });
  return { id };
});
