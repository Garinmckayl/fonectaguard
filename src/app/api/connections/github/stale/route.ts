import { route } from "@/lib/api";
import { HttpError, canWrite } from "@/lib/auth";
import { githubConnection } from "@/lib/connectors";
import { awaitPublished, writeField } from "@/lib/github";
import { audit } from "@/lib/events";
import { getLocation } from "@/lib/queries";

const STALE = { phone: "+358 9 555 0100", hours: "Mo-Fr 08:00-15:00; Sa 09:00-12:00" } as const;

/** A real commit that deliberately introduces an outdated value on the connected site, to test the detect → approve → repair → verify loop on a real page. */
export const POST = route(true, async ({ s, db, req }) => {
  const field = ((await req.json().catch(() => ({}))) as { field?: string }).field === "hours" ? "hours" : "phone";
  if (!canWrite(s.role)) throw new HttpError(403, "Insufficient permissions");
  const conn = await githubConnection(db, s.orgId);
  const loc = await getLocation(db, s.orgId);
  if (!conn?.externalAccountId || !loc?.website) throw new HttpError(400, "Connect your GitHub Pages site first");
  const res = await writeField(conn.externalAccountId, field, STALE[field], `FonectaGuard test: deliberately introduce outdated ${field}`);
  if (!res.ok) throw new HttpError(502, String(res.response.error ?? "GitHub write failed"));
  const live = await awaitPublished(loc.website, field, STALE[field]);
  await audit(db, s.orgId, s.userId, "connection.github_stale_commit", res.response);
  return { ok: true, live, commit: res.response.commitUrl ?? null };
});
