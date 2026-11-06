import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { HttpError, canWrite } from "@/lib/auth";
import { schema } from "@/lib/db";
import { audit } from "@/lib/events";
import { newId, now } from "@/lib/ids";
import { GithubError, inspectRepo, sameSite } from "@/lib/github";
import { getLocation } from "@/lib/queries";

const Body = z.object({ repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Use owner/repo format") });

export const POST = route(true, async ({ s, db, req }) => {
  if (!canWrite(s.role)) throw new HttpError(403, "Insufficient permissions");
  const { repo } = Body.parse(await req.json().catch(() => ({})));
  const loc = await getLocation(db, s.orgId);
  if (!loc?.website) throw new HttpError(400, "Add your business website first");
  let info;
  try { info = await inspectRepo(repo); } catch (e) { throw new HttpError(400, e instanceof GithubError ? e.message : "GitHub check failed"); }
  if (!sameSite(info.pagesUrl, loc.website)) throw new HttpError(400, `That repository publishes ${info.pagesUrl}, which is not your business website (${loc.website}).`);
  const existing = await db.select().from(schema.connections).where(and(eq(schema.connections.organizationId, s.orgId), eq(schema.connections.platform, "github"))).get();
  if (existing) await db.update(schema.connections).set({ externalAccountId: repo, status: "connected", capabilitiesJson: ["read", "write", "verify"], lastSyncedAt: now() }).where(eq(schema.connections.id, existing.id)).run();
  else await db.insert(schema.connections).values({ id: newId(), organizationId: s.orgId, platform: "github", externalAccountId: repo, status: "connected", capabilitiesJson: ["read", "write", "verify"], expiresAt: null, lastSyncedAt: now() }).run();
  // Write access to the repository that serves the site is proof of control over it.
  await db.update(schema.businessLocations).set({ verificationStatus: "verified", updatedAt: now() }).where(eq(schema.businessLocations.id, loc.id)).run();
  await audit(db, s.orgId, s.userId, "connection.github_connected", { repo, site: info.pagesUrl });
  return { ok: true, repo, site: info.pagesUrl };
});
