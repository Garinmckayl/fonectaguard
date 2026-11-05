import { route } from "@/lib/api";
import { resetDemo } from "@/lib/demo";

export const POST = route(true, async ({ s, db }) => {
  if (!s.isDemo) throw new Error("Demo only");
  await resetDemo(db, s.userId, s.orgId);
  return { ok: true };
});
