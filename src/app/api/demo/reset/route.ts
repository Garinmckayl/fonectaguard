import { route } from "@/lib/api";
import { resetDemo } from "@/lib/demo";

export const POST = route(true, ({ s, db }) => {
  if (!s.isDemo) throw new Error("Demo only");
  resetDemo(db, s.userId, s.orgId);
  return { ok: true };
});
