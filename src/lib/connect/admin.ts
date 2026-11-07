import crypto from "crypto";
import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type DB } from "../db";
import { mirrorBusiness } from "./yext";
import { entityId, getBiz } from "./service";

export const ADMIN_COOKIE = "cn_admin";
/** The console is for the team and the judges: gated by a key held as a Worker secret (CONNECT_ADMIN_KEY). */
export const adminToken = () => crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "dev-insecure-secret").update(`connect-admin:${process.env.CONNECT_ADMIN_KEY ?? ""}`).digest("hex").slice(0, 40);
export const keyOk = (k: string | null) => !!process.env.CONNECT_ADMIN_KEY && !!k && k.length === process.env.CONNECT_ADMIN_KEY.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(process.env.CONNECT_ADMIN_KEY));
export async function isAdmin() { const c = (await cookies()).get(ADMIN_COOKIE)?.value; return !!process.env.CONNECT_ADMIN_KEY && !!c && c === adminToken(); }

/** Puts one business back to its starting state (for re-running the demo) and clears the sandbox exceptions it created. */
export async function resetBusiness(db: DB, id: string) {
  const biz = await getBiz(db, id);
  if (!biz) return false;
  await db.delete(schema.cnEvents).where(eq(schema.cnEvents.businessId, id)).run();
  await db.delete(schema.cnRules).where(eq(schema.cnRules.businessId, id)).run();
  await db.delete(schema.cnAlerts).where(eq(schema.cnAlerts.businessId, id)).run();
  await db.delete(schema.cnMemory).where(eq(schema.cnMemory.businessId, id)).run();
  await db.delete(schema.cnMessages).where(eq(schema.cnMessages.businessId, id)).run();
  await db.update(schema.cnSuggestions).set({ status: "draft", finalHours: null, undoJson: null, messageId: null, note: null, sentAt: null, decidedAt: null, appliedAt: null }).where(and(eq(schema.cnSuggestions.businessId, id), inArray(schema.cnSuggestions.action, ["SUGGEST", "ASK"]))).run();
  await db.update(schema.cnSuggestions).set({ status: "flagged", messageId: null, sentAt: null }).where(and(eq(schema.cnSuggestions.businessId, id), eq(schema.cnSuggestions.action, "FLAG"))).run();
  await mirrorBusiness(entityId(), { name: biz.name, regular: biz.regularJson as Record<string, string> | null }).catch(() => undefined);
  return true;
}
