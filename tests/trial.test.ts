import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { newId, now } from "@/lib/ids";
import { createTrial, cleanupTrials } from "@/lib/connect/trial";
import { decide } from "@/lib/connect/service";

describe("Try it: a private copy per visitor", () => {
  let db: DB;
  beforeEach(async () => {
    process.env.YEXT_API_KEY = "k"; process.env.YEXT_ENTITY_ID = "SinceAI16";
    const entity: Record<string, unknown> = { name: "Kahvila Aurora", hours: { holidayHours: [] }, meta: { id: "SinceAI16" } };
    vi.stubGlobal("fetch", async (_u: string, init?: { method?: string; body?: string }) => { if (init?.method === "PUT") Object.assign(entity, JSON.parse(init.body!)); return new Response(JSON.stringify({ response: entity }), { status: 200 }); });
    db = openTestDb();
    await db.insert(schema.cnBusinesses).values({ id: "FI-D0001", name: "Kahvila Aurora", city: "Helsinki", country: "FI", language: "fi", channel: "SMS", contactName: "Aleksi", linkCode: "c", telegramChatId: "55", email: "a@b.fi", mobile: "+358", standing: 1, publishersJson: [{ name: "Google", status: "LIVE", seconds: 120 }], createdAt: now() }).run();
    const row = (date: string, proposed: string, tier: string) => db.insert(schema.cnSuggestions).values({ id: newId(), businessId: "FI-D0001", date, dayKey: date, action: "SUGGEST", shown: "07:30-18:00", proposed, confidence: 0.9, tier, basis: "last_year", reasonsJson: [], viewsEst: 1, status: "applied", finalHours: "closed", token: newId(), createdAt: now() }).run();
    await row("2026-12-24", "07:30-13:00", "one_tap"); await row("2026-12-25", "closed", "auto");
  });
  it("gives each visitor a fresh, unlinked copy; the original is untouched", async () => {
    const a = await createTrial(db), b = await createTrial(db);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.businessId).not.toBe(b.businessId); expect(a.token).not.toBe(b.token);
    const copy = (await db.select().from(schema.cnBusinesses).where(eq(schema.cnBusinesses.id, a.businessId)).get())!;
    expect(copy).toMatchObject({ telegramChatId: null, email: null, mobile: null, standing: 0, language: "en" });
    const sugs = await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.businessId, a.businessId)).all();
    expect(sugs.every((s) => ["sent", "flagged"].includes(s.status))).toBe(true);
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.businessId, "FI-D0001")).all()).every((s) => s.status === "applied")).toBe(true);
  });
  it("approving on a copy writes to Yext; old copies are cleaned up", async () => {
    const a = await createTrial(db);
    if (!a.ok) throw new Error("no trial");
    const s = (await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.businessId, a.businessId)).all()).find((x) => x.date === "2026-12-24")!;
    expect((await decide(db, s.id, { action: "approve" })).ok).toBe(true);
    await db.update(schema.cnBusinesses).set({ createdAt: now() - 2 * 86400_000 }).where(like(schema.cnBusinesses.id, "TRY-%")).run();
    expect(await cleanupTrials(db)).toBe(1);
    expect((await db.select().from(schema.cnBusinesses).where(like(schema.cnBusinesses.id, "TRY-%")).all()).length).toBe(0);
    expect((await db.select().from(schema.cnBusinesses).where(eq(schema.cnBusinesses.id, "FI-D0001")).all()).length).toBe(1);
  });
});
