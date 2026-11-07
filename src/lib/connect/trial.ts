import { and, eq, inArray, like, lt } from "drizzle-orm";
import { schema, type DB } from "../db";
import { newId, now } from "../ids";
import { createMessage, getBiz, log, nextItems, sugsFor } from "./service";

/**
 * "Try it": anyone (a judge, a visitor) opens /try and gets their own private copy of the demo café with a fresh set of
 * suggestions and a no-login decision page. Approving writes to the Yext sandbox for real. Copies are deleted after a day.
 * Nobody is contacted: no channel is linked to a copy.
 */
const SOURCE = "FI-D0001", MAX_PER_HOUR = 120, TTL_MS = 24 * 3600_000;
const tok = () => [...crypto.getRandomValues(new Uint8Array(14))].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

export async function createTrial(db: DB): Promise<{ ok: true; token: string; businessId: string } | { ok: false; error: string }> {
  const bucket = `try:${Math.floor(now() / 3600_000)}`;
  const cur = await db.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, bucket)).get();
  if ((cur?.count ?? 0) >= MAX_PER_HOUR) return { ok: false, error: "busy" };
  if (cur) await db.update(schema.rateLimits).set({ count: cur.count + 1 }).where(eq(schema.rateLimits.key, bucket)).run();
  else await db.insert(schema.rateLimits).values({ key: bucket, windowStart: now(), count: 1 }).onConflictDoNothing().run();

  const src = await getBiz(db, SOURCE);
  if (!src) return { ok: false, error: "no demo business" };
  const id = `TRY-${newId().slice(-8).toLowerCase()}`;
  await db.insert(schema.cnBusinesses).values({ ...src, id, language: "en", telegramChatId: null, email: null, mobile: null, standing: 0, optedOut: 0, voice: 0, linkCode: tok(), createdAt: now() }).run();
  for (const s of await sugsFor(db, SOURCE)) {
    await db.insert(schema.cnSuggestions).values({ ...s, id: `${id}:${s.date}`, businessId: id, status: s.action === "FLAG" ? "flagged" : "draft", finalHours: null, undoJson: null, messageId: null, note: null, token: tok(), createdAt: now(), sentAt: null, decidedAt: null, appliedAt: null }).run();
  }
  const biz = (await getBiz(db, id))!, items = await nextItems(db, biz);
  if (!items.length) return { ok: false, error: "nothing to show" };
  const msg = await createMessage(db, biz, items);
  await log(db, id, "trial_created", { from: SOURCE });
  return { ok: true, token: msg.token, businessId: id };
}

/** Cron: removes copies older than a day (and everything hanging off them). */
export async function cleanupTrials(db: DB) {
  const old = (await db.select().from(schema.cnBusinesses).where(and(like(schema.cnBusinesses.id, "TRY-%"), lt(schema.cnBusinesses.createdAt, now() - TTL_MS))).all()).map((b) => b.id);
  if (!old.length) return 0;
  for (const t of [schema.cnSuggestions, schema.cnMessages, schema.cnEvents, schema.cnMemory, schema.cnChanges, schema.cnRules, schema.cnAlerts] as const) await db.delete(t).where(inArray(t.businessId, old)).run();
  await db.delete(schema.cnBusinesses).where(inArray(schema.cnBusinesses.id, old)).run();
  return old.length;
}
