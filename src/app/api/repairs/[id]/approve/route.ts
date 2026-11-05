import { z } from "zod";
import { route } from "@/lib/api";
import { approveRepair } from "@/lib/repair";

const Body = z.object({ editedValue: z.string().min(1).max(500).optional(), live: z.boolean().optional() });

export const POST = route(true, async ({ s, db, req, params }) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  return approveRepair(db, { proposalId: params.id, orgId: s.orgId, userId: s.userId, role: s.role, editedValue: body.editedValue }, { paceMs: body.live ? 600 : 0 });
});
