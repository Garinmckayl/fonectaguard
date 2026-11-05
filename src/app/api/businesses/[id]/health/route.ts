import { route } from "@/lib/api";
import { ownLocation } from "@/lib/guards";
import { locationHealth } from "@/lib/scan";

export const GET = route(false, async ({ s, db, params }) => {
  await ownLocation(db, s, params.id);
  return await locationHealth(db, params.id);
});
