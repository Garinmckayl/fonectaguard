import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { newId, now } from "@/lib/ids";
import { changeViolation, dateViolation, planViolation, weekdayOf, ruleText, blockedText, addRule, loadRules, RuleZ, type Rule } from "@/lib/connect/rules";
import { autoApplyStanding, decide, getBiz, nextItems } from "@/lib/connect/service";
import { computeIssues, radarText } from "@/lib/connect/radar";

const closed = { closed: true as const }, open = (a: string, b: string) => ({ closed: false as const, intervals: [{ start: a, end: b }] });
const FRI = "2026-12-04", SAT = "2026-12-05"; // a Friday and a Saturday

describe("owner rules are a deterministic floor", () => {
  it("knows weekdays", () => { expect(weekdayOf(FRI)).toBe("friday"); expect(weekdayOf(SAT)).toBe("saturday"); expect(weekdayOf("2026-12-06")).toBe("sunday"); });
  it("never_closed blocks closing on that weekday only", () => {
    const r: Rule[] = [{ kind: "never_closed", weekday: "friday" }];
    expect(dateViolation(r, FRI, closed)).toMatchObject({ kind: "never_closed" });
    expect(dateViolation(r, FRI, open("10:00", "15:00"))).toBeNull();
    expect(dateViolation(r, SAT, closed)).toBeNull();
  });
  it("open_until blocks early closing, allows past-midnight, and (with a weekday) blocks closed days", () => {
    const r: Rule[] = [{ kind: "open_until", time: "22:00", weekday: "friday" }];
    expect(dateViolation(r, FRI, open("16:00", "20:00"))).not.toBeNull();
    expect(dateViolation(r, FRI, open("16:00", "22:00"))).toBeNull();
    expect(dateViolation(r, FRI, open("16:00", "02:00"))).toBeNull();      // runs past midnight
    expect(dateViolation(r, FRI, closed)).not.toBeNull();
    expect(dateViolation(r, SAT, open("16:00", "18:00"))).toBeNull();
    expect(dateViolation([{ kind: "open_until", time: "22:00" }], SAT, closed)).toBeNull(); // no weekday: closing a day is not "closing early"
  });
  it("lock_date and lock_field", () => {
    expect(dateViolation([{ kind: "lock_date", date: FRI }], FRI, open("10:00", "11:00"))).not.toBeNull();
    expect(changeViolation([{ kind: "lock_field", field: "phone" }], { type: "phone", value: "+358401234567" })).not.toBeNull();
    expect(changeViolation([{ kind: "lock_field", field: "phone" }], { type: "website", value: "https://x.fi" })).toBeNull();
  });
  it("covers closures and weekly hours", () => {
    const r: Rule[] = [{ kind: "never_closed", weekday: "friday" }];
    expect(changeViolation(r, { type: "temporary_closure", from: "2026-12-02", to: "2026-12-06" })).not.toBeNull();
    expect(changeViolation(r, { type: "temporary_closure", from: "2026-12-05", to: "2026-12-06" })).toBeNull();
    expect(changeViolation(r, { type: "regular_hours", days: { friday: "closed" } })).not.toBeNull();
    expect(changeViolation(r, { type: "regular_hours", days: { saturday: "closed" } })).toBeNull();
    expect(planViolation(r, "friday", closed)).not.toBeNull();
  });
  it("rejects malformed rules and explains in the owner's language", () => {
    expect(RuleZ.safeParse({ kind: "never_closed", weekday: "funday" }).success).toBe(false);
    expect(RuleZ.safeParse({ kind: "open_until", time: "25:00" }).success).toBe(false);
    expect(ruleText({ kind: "never_closed", weekday: "friday" }, "fi")).toContain("perjantaina");
    expect(blockedText({ kind: "never_closed", weekday: "friday" }, "en")).toContain("Blocked by your rule");
  });
});

describe("the floor in the live flow", () => {
  let db: DB;
  const puts: unknown[] = [];
  beforeEach(async () => {
    process.env.YEXT_API_KEY = "k"; process.env.YEXT_ENTITY_ID = "SinceAI16"; puts.length = 0;
    const entity: Record<string, unknown> = { name: "Pub", hours: { holidayHours: [] }, meta: { id: "SinceAI16" } };
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "PUT") { const b = JSON.parse(init.body!); puts.push(b); Object.assign(entity, b); }
      return new Response(JSON.stringify({ response: entity }), { status: 200 });
    });
    db = openTestDb();
    await db.insert(schema.cnBusinesses).values({ id: "FI-R1", name: "Pub", city: "Turku", country: "FI", language: "en", channel: "SMS", linkCode: "c", standing: 1, publishersJson: [{ name: "Google", status: "LIVE", seconds: 60 }, { name: "Bing", status: "OPTED_OUT", seconds: 0 }], createdAt: now() }).run();
    const sug = (date: string, proposed: string, tier: string) => db.insert(schema.cnSuggestions).values({ id: newId(), businessId: "FI-R1", date, dayKey: date, action: "SUGGEST", shown: "16:00-23:00", proposed, confidence: 0.97, tier, basis: "last_year", reasonsJson: [], viewsEst: 1, status: "draft", token: newId(), createdAt: now() }).run();
    await sug(FRI, "closed", "auto"); await sug(SAT, "closed", "auto");
  });

  it("a suggestion that breaks a rule is withheld, never sent and never auto-applied; others proceed", async () => {
    await addRule(db, "FI-R1", { kind: "never_closed", weekday: "friday" });
    const biz = (await getBiz(db, "FI-R1"))!;
    expect((await nextItems(db, biz)).map((s) => s.date)).toEqual([SAT]);
    const rows = await db.select().from(schema.cnSuggestions).all();
    expect(rows.find((r) => r.date === FRI)).toMatchObject({ status: "blocked" });
    expect(rows.find((r) => r.date === FRI)!.note).toContain("Never closed on Fridays");
    const done = await autoApplyStanding(db, biz);
    expect(done.map((s) => s.date)).toEqual([SAT]);                                   // autopilot only did the allowed one
  });

  it("an owner approving a blocked day by hand is told which rule stopped it", async () => {
    const biz = (await getBiz(db, "FI-R1"))!;
    const fri = (await db.select().from(schema.cnSuggestions).all()).find((r) => r.date === FRI)!;
    await db.update(schema.cnSuggestions).set({ status: "sent" }).where(eq(schema.cnSuggestions.id, fri.id)).run();
    await addRule(db, biz.id, { kind: "never_closed", weekday: "friday" });
    const r = await decide(db, fri.id, { action: "approve" });
    expect(r.ok).toBe(false); expect(r.text).toContain("Blocked by your rule");
    expect(puts).toHaveLength(0);
  });

  it("rules load back as typed rules and ignore corrupt rows", async () => {
    await addRule(db, "FI-R1", { kind: "lock_field", field: "phone" });
    await db.insert(schema.cnRules).values({ id: newId(), businessId: "FI-R1", kind: "nonsense", paramsJson: {}, createdAt: now() }).run();
    expect((await loadRules(db, "FI-R1")).map((r) => r.rule.kind)).toEqual(["lock_field"]);
  });
});

describe("issue radar", () => {
  it("lists only real findings, most severe first, and says what it does not watch yet", async () => {
    delete process.env.YEXT_API_KEY;
    const db = openTestDb();
    await db.insert(schema.cnBusinesses).values({ id: "FI-R2", name: "Cafe", country: "FI", language: "fi", channel: "SMS", linkCode: "c", publishersJson: [{ name: "Bing", status: "OPTED_OUT", seconds: 0 }], createdAt: now() }).run();
    await db.insert(schema.cnSuggestions).values({ id: newId(), businessId: "FI-R2", date: FRI, dayKey: "x", action: "SUGGEST", shown: "09:00-17:00", proposed: "closed", confidence: 0.8, tier: "one_tap", basis: "last_year", reasonsJson: [], viewsEst: 1, status: "sent", token: newId(), createdAt: now() }).run();
    await db.insert(schema.cnEvents).values({ id: newId(), businessId: "FI-R2", type: "agent_presence", detailJson: { assistants: [{ a: "Perplexity", wrong: 2, confused: null }, { a: "GPT", wrong: 0, confused: "Aurora Oy" }] }, createdAt: now() }).run();
    const biz = (await getBiz(db, "FI-R2"))!;
    const radar = await computeIssues(db, biz, { live: false });
    expect(radar.issues.map((i) => i.code)).toEqual(["hours_waiting", "ai_wrong", "ai_confused", "listing_off"]);
    expect(radar.coverage.notYet.join()).toContain("photo");
    const text = radarText(radar, "fi");
    expect(text).toContain("Perplexity"); expect(text).toContain("Bing"); expect(text).toContain(FRI);
    expect(radarText({ issues: [], coverage: radar.coverage }, "en")).toBe("Nothing needs your attention right now.");
  });
});
