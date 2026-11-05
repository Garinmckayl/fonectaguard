import { route } from "@/lib/api";
import { retryRepair } from "@/lib/repair";

export const POST = route(true, ({ s, db, params }) => retryRepair(db, { proposalId: params.id, orgId: s.orgId, role: s.role }));
