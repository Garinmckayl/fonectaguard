import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError, canWrite } from "@/lib/auth";
import { pendingPages, selectPage } from "@/lib/facebook-connect";

export const POST = route(true, async ({ s, db, req }) => {
  if (!canWrite(s.role)) throw new HttpError(403, "Insufficient permissions");
  const { pageId } = z.object({ pageId: z.string().regex(/^\d+$/) }).parse(await req.json().catch(() => ({})));
  const page = (await pendingPages(db, s.orgId)).find((p) => p.id === pageId);
  if (!page) throw new HttpError(404, "That Page is not in your list. Connect again.");
  await selectPage(db, s.orgId, s.userId, page);
  return { ok: true };
});
