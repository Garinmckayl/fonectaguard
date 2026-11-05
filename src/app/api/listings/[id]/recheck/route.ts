import { route } from "@/lib/api";
import { ownListing } from "@/lib/guards";
import { recheckListing } from "@/lib/scan";

export const POST = route(true, async ({ s, db, params }) => {
  await ownListing(db, s, params.id);
  const r = await recheckListing(db, params.id);
  return r.ok ? { ok: true, issues: r.issues } : { ok: false, error: r.error };
});
