import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError, canWrite } from "@/lib/auth";
import { verifyProfile } from "@/lib/canonical";
import { audit } from "@/lib/events";
import { ownLocation } from "@/lib/guards";

const Body = z.object({ fields: z.object({ name: z.string().max(200), address: z.string().max(300), phone: z.string().max(40), hours: z.string().max(300), website: z.string().max(300) }).partial() });

/** The owner confirms (and may correct) the facts that become the source of truth. Only this route turns a website-derived value into an owner-confirmed one. */
export const POST = route(true, async ({ s, db, req, params }) => {
  if (!canWrite(s.role)) throw new HttpError(403, "Insufficient permissions");
  const loc = await ownLocation(db, s, params.id);
  const { fields } = Body.parse(await req.json());
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && v.trim())) as typeof fields;
  if (!Object.keys(clean).length) throw new HttpError(400, "Nothing to confirm");
  let written: string[];
  try { written = await verifyProfile(db, loc.id, s.userId, clean, "owner_confirmed"); } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "Invalid value"); }
  await audit(db, s.orgId, s.userId, "profile.confirmed", { fields: Object.keys(clean), changed: written });
  return { ok: true, confirmed: Object.keys(clean) };
});
