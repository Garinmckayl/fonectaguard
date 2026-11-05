import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { schema } from "@/lib/db";
import { editProposal } from "@/lib/repair";

export const PATCH = route(true, async ({ s, db, req, params }) => {
  const body = z.object({ newValue: z.string().min(1).max(500) }).parse(await req.json());
  editProposal(db, { proposalId: params.id, orgId: s.orgId, userId: s.userId, role: s.role, newValue: body.newValue });
  return { ok: true };
});

export const GET = route(false, ({ s, db, params }) => {
  const p = db.select().from(schema.repairProposals).where(eq(schema.repairProposals.id, params.id)).get();
  const d = p && db.select().from(schema.discrepancies).where(eq(schema.discrepancies.id, p.discrepancyId)).get();
  const loc = d && db.select().from(schema.businessLocations).where(eq(schema.businessLocations.id, d.locationId)).get();
  if (!p || !loc || loc.organizationId !== s.orgId) throw new HttpError(404, "Not found");
  const attempts = db.select().from(schema.repairAttempts).where(eq(schema.repairAttempts.proposalId, p.id)).orderBy(asc(schema.repairAttempts.attemptedAt)).all();
  return { proposal: p, attempts };
});
