import { eq } from "drizzle-orm";
import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { schema } from "@/lib/db";
import { emit } from "@/lib/events";
import { now } from "@/lib/ids";

const Body = z.object({ slug: z.string(), field: z.enum(["phone", "hours", "address"]), value: z.string().min(1).max(200) });

// Simulates external drift on a fictional demo listing (real write to the persisted demo record).
export const POST = route(true, async ({ s, db, req }) => {
  if (!s.isDemo) throw new HttpError(403, "Demo only");
  const b = Body.parse(await req.json());
  const row = (await db.select().from(schema.demoListings).where(eq(schema.demoListings.slug, b.slug)).get());
  if (!row || row.organizationId !== s.orgId) throw new HttpError(404, "Not found");
  (await db.update(schema.demoListings).set({ [b.field]: b.value, updatedAt: now() }).where(eq(schema.demoListings.slug, b.slug)).run());
  await emit(db, s.orgId, null, null, "demo_drift", `[Demo] Simulated external change: ${row.platform} ${b.field} → "${b.value}".`);
  return { ok: true };
});
