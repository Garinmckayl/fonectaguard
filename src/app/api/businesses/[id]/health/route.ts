import { route } from "@/lib/api";
import { ownLocation } from "@/lib/guards";
import { locationHealth } from "@/lib/scan";

export const GET = route(false, ({ s, db, params }) => {
  ownLocation(db, s, params.id);
  return locationHealth(db, params.id);
});
