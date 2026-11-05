import { route } from "@/lib/api";
import { ownLocation } from "@/lib/guards";
import { startScan } from "@/lib/scan";

export const POST = route(true, async ({ s, db, req, params }) => {
  ownLocation(db, s, params.id);
  const body = await req.json().catch(() => ({}));
  // "live" paces steps so a viewer can watch real progress; the work performed is identical.
  return startScan(db, params.id, { trigger: "manual", paceMs: body?.live ? 700 : 0 });
});
