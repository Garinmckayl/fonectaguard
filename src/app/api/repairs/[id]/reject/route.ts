import { z } from "zod";
import { route } from "@/lib/api";
import { rejectProposal } from "@/lib/repair";

export const POST = route(true, async ({ s, db, req, params }) => {
  const body = z.object({ reason: z.string().max(500).optional() }).parse(await req.json().catch(() => ({})));
  rejectProposal(db, { proposalId: params.id, orgId: s.orgId, userId: s.userId, role: s.role, reason: body.reason });
  return { ok: true };
});
