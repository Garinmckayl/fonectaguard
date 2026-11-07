import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { sessionCookie } from "@/lib/auth";
import { deleteWorkspace } from "@/lib/workspace-delete";

/** Self-serve erasure: removes the signed-in owner's whole workspace and signs them out. Owner-only and explicitly confirmed. */
export const POST = route(true, async ({ s, db, req }) => {
  if (s.role !== "owner") throw new HttpError(403, "Only the workspace owner can delete it");
  const { confirm } = z.object({ confirm: z.string() }).parse(await req.json().catch(() => ({})));
  if (confirm !== "DELETE") throw new HttpError(400, 'Type DELETE to confirm');
  await deleteWorkspace(db, s.orgId, s.userId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie.name, "", { ...sessionCookie.options, maxAge: 0 });
  return res;
});
