import { and, eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { HttpError, canWrite } from "@/lib/auth";
import { schema } from "@/lib/db";
import { audit } from "@/lib/events";

/** Removes the stored Page token. (Access can also be revoked from Facebook's Business Integrations settings.) */
export const POST = route(true, async ({ s, db }) => {
  if (!canWrite(s.role)) throw new HttpError(403, "Insufficient permissions");
  await db.update(schema.connections).set({ status: "revoked", encryptedCredentialReference: null }).where(and(eq(schema.connections.organizationId, s.orgId), eq(schema.connections.platform, "facebook"))).run();
  await audit(db, s.orgId, s.userId, "connection.facebook_disconnected");
  return { ok: true };
});
