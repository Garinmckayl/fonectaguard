import { eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { HttpError, canWrite } from "@/lib/auth";
import { schema } from "@/lib/db";
import { audit } from "@/lib/events";
import { ownDiscrepancy } from "@/lib/guards";

// Dismisses a false match / unwanted finding. Allowed only before any external write is underway.
export const POST = route(true, ({ s, db, params }) => {
  if (!canWrite(s.role)) throw new HttpError(403, "Insufficient permissions");
  const d = ownDiscrepancy(db, s, params.id);
  if (["approved", "applying", "verifying", "resolved", "dismissed"].includes(d.status)) throw new HttpError(409, `Cannot dismiss in status ${d.status}`);
  db.update(schema.discrepancies).set({ status: "dismissed" }).where(eq(schema.discrepancies.id, d.id)).run();
  db.update(schema.repairProposals).set({ status: "rejected" }).where(eq(schema.repairProposals.discrepancyId, d.id)).run();
  audit(db, s.orgId, s.userId, "discrepancy.dismissed", { id: d.id });
  return { ok: true };
});
