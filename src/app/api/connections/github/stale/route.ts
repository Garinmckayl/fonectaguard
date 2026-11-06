import { route } from "@/lib/api";
import { HttpError, canWrite } from "@/lib/auth";
import { githubConnection } from "@/lib/connectors";
import { awaitPublished, writeField } from "@/lib/github";
import { audit } from "@/lib/events";
import { getLocation } from "@/lib/queries";

const STALE_PHONE = "+358 9 555 0100";

/** Real commit that makes the connected site's phone number outdated, so the repair loop can be demonstrated end to end. */
export const POST = route(true, async ({ s, db }) => {
  if (!canWrite(s.role)) throw new HttpError(403, "Insufficient permissions");
  const conn = await githubConnection(db, s.orgId);
  const loc = await getLocation(db, s.orgId);
  if (!conn?.externalAccountId || !loc?.website) throw new HttpError(400, "Connect your GitHub Pages site first");
  const res = await writeField(conn.externalAccountId, "phone", STALE_PHONE, "FonectaGuard demo: simulate an outdated phone number");
  if (!res.ok) throw new HttpError(502, String(res.response.error ?? "GitHub write failed"));
  const live = await awaitPublished(loc.website, "phone", STALE_PHONE);
  await audit(db, s.orgId, s.userId, "connection.github_stale_commit", res.response);
  return { ok: true, live, commit: res.response.commitUrl ?? null };
});
