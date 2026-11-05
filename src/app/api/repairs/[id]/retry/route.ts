import { route } from "@/lib/api";
import { retryRepair } from "@/lib/repair";

export const POST = route(true, async ({ s, db, params }) => await retryRepair(db, { proposalId: params.id, orgId: s.orgId, role: s.role }));
