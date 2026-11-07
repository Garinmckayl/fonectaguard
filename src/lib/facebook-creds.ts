import { and, eq } from "drizzle-orm";
import { schema, type DB } from "./db";
import { decryptSecret } from "./crypto";

export const fbRow = (db: DB, orgId: string) => db.select().from(schema.connections).where(and(eq(schema.connections.organizationId, orgId), eq(schema.connections.platform, "facebook"))).get();

/** The connected Page and its (decrypted) token, or null. Kept separate from the connect flow so the scan engine can use it without a cycle. */
export async function fbConnection(db: DB, orgId: string): Promise<{ connId: string; pageId: string; name: string; token: string } | null> {
  const c = await fbRow(db, orgId);
  if (!c || c.status !== "connected" || !c.encryptedCredentialReference) return null;
  try {
    const j = JSON.parse(await decryptSecret(c.encryptedCredentialReference)) as { pageId: string; name: string; token: string };
    return { connId: c.id, ...j };
  } catch { return null; }
}
