import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { newId, now } from "@/lib/ids";
import { applySuggestion, autoApplyStanding, decide, getBiz, getSug, nextItems, sugsFor, toPlan, fromPlan, undoSuggestion, whereItShows } from "@/lib/connect/service";
import { sendNow } from "@/lib/connect/deliver";
import { handleUpdate } from "@/lib/connect/telegram-bot";
import { parseSimplePlan, validatePlan, shiftClose, closeDelta } from "@/lib/connect/plan";
import { fmtEta, fmtHours } from "@/lib/connect/i18n";
import { reasonText } from "@/lib/connect/reasons";

const REG = { monday: "08:00-18:00", tuesday: "08:00-18:00", wednesday: "08:00-18:00", thursday: "08:00-18:00", friday: "08:00-18:00", saturday: "closed", sunday: "closed" };
const PUBS = [{ name: "Google (Search & Maps)", status: "LIVE", seconds: 120 }, { name: "Apple Maps", status: "LIVE", seconds: 172800 }, { name: "Facebook", status: "OPTED_OUT", seconds: 600 }];

function world() {
  const yext = { name: "Harbour Lights Pub", hours: undefined as Record<string, unknown> | undefined, puts: 0 };
  const tg: { method: string; body: Record<string, unknown> }[] = [], mails: { to: string[]; subject: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
    const u = new URL(url);
    if (u.hostname === "sbx-api.yextapis.com") {
      if (init?.method === "PUT") { const b = JSON.parse(init.body!); yext.puts++; if (b.name) yext.name = b.name; if (b.hours) yext.hours = b.hours; }
      return new Response(JSON.stringify({ response: { name: yext.name, hours: yext.hours, meta: { id: "SinceAI16" } } }), { status: 200 });
    }
    if (u.hostname === "api.telegram.org") { const method = u.pathname.split("/").pop()!; tg.push({ method, body: JSON.parse(init!.body!) }); return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }); }
    if (u.hostname === "api.resend.com") { const b = JSON.parse(init!.body!); mails.push({ to: b.to, subject: b.subject }); return new Response(JSON.stringify({ id: "em_1" }), { status: 200 }); }
    return new Response("{}", { status: 404 });
  });
  return { yext, tg, mails };
}

async function seed(db: DB, o: { id?: string; standing?: number; optedOut?: number; lang?: string; sugs?: { date: string; key: string; proposed: string; conf?: number; shown?: string; action?: string; tier?: string }[] } = {}) {
  const id = o.id ?? "FI-T0001";
  await db.insert(schema.cnBusinesses).values({ id, name: "Kahvila Aurora", city: "Helsinki", country: "FI", segment: "cafe", language: o.lang ?? "fi", channel: "SMS", contactName: "Aleksi", standing: o.standing ?? 0, optedOut: o.optedOut ?? 0, linkCode: "abc12345", publishersJson: PUBS, regularJson: REG, createdAt: now() }).run();
  for (const s of o.sugs ?? [{ date: "2026-12-24", key: "XMAS_EVE", proposed: "07:30-13:00" }, { date: "2026-12-25", key: "XMAS_DAY", proposed: "closed" }, { date: "2026-12-31", key: "NYE", proposed: "08:00-16:00" }]) {
    await db.insert(schema.cnSuggestions).values({ id: `${id}:${s.date}`, businessId: id, date: s.date, dayKey: s.key, action: s.action ?? "SUGGEST", shown: s.shown ?? "08:00-18:00", proposed: s.proposed, confidence: s.conf ?? 0.8, tier: s.tier ?? "one_tap", basis: "last_year", reasonsJson: [{ k: "last_year", hours: s.proposed }] as unknown as string[], viewsEst: 10, status: s.action === "FLAG" ? "flagged" : "draft", token: newId(), createdAt: now() }).run();
  }
  return id;
}

describe("hours handling", () => {
  it("reads the ways owners actually write hours, and rejects nonsense", () => {
    expect(parseSimplePlan("10-15")).toEqual({ closed: false, intervals: [{ start: "10:00", end: "15:00" }] });
    expect(parseSimplePlan("klo 10.30–15.00")).toEqual({ closed: false, intervals: [{ start: "10:30", end: "15:00" }] });
    expect(parseSimplePlan("from 12 to 3pm")).toEqual({ closed: false, intervals: [{ start: "12:00", end: "15:00" }] });
    expect(parseSimplePlan("suljettu")).toEqual({ closed: true });
    expect(parseSimplePlan("closed")).toEqual({ closed: true });
    expect(parseSimplePlan("hello there")).toBeNull();
    expect(validatePlan({ closed: false, intervals: [{ start: "10:00", end: "10:00" }] })).toMatch(/same/);
    expect(validatePlan({ closed: false, intervals: [{ start: "10:00", end: "14:00" }, { start: "13:00", end: "18:00" }] })).toMatch(/overlap/);
    expect(validatePlan(toPlan("18:00-02:00"))).toBeNull(); // past midnight
    expect(fromPlan(toPlan("10:00-14:00,17:00-22:00"))).toBe("10:00-14:00,17:00-22:00");
  });
  it("learns a closing-time shift and applies it", () => {
    const d = closeDelta(toPlan("12:00-16:00"), toPlan("12:00-15:00"));
    expect(d).toBe(-60);
    expect(fromPlan(shiftClose(toPlan("10:00-18:00"), -60))).toBe("10:00-17:00");
  });
  it("writes the same facts in each language", () => {
    expect(fmtHours("closed", "fi")).toBe("suljettu"); expect(fmtHours("closed", "sv")).toBe("stängt"); expect(fmtHours("closed", "nb")).toBe("stengt");
    expect(fmtEta(120, "en")).toBe("2 min"); expect(fmtEta(172800, "fi")).toBe("2 vrk"); expect(fmtEta(604800, "en")).toBe("7 days");
    expect(reasonText({ k: "last_year", hours: "closed" }, "fi")).toContain("suljettu");
    expect(reasonText({ k: "peers_closed", pct: 82 }, "sv")).toContain("82 %");
  });
});

describe("the five-step loop", () => {
  let db: DB, w: ReturnType<typeof world>;
  beforeEach(() => { process.env.YEXT_API_KEY = "k"; process.env.TELEGRAM_BOT_TOKEN = "t"; process.env.RESEND_API_KEY = "r"; process.env.DEMO_EMAIL = "demo@x.test"; process.env.YEXT_ENTITY_ID = "SinceAI16"; delete process.env.OPENROUTER_API_KEY; db = openTestDb(); w = world(); });

  it("approve: writes to Yext, mirrors the business, verifies, and tells the owner where it shows", async () => {
    const id = await seed(db);
    const r = await decide(db, `${id}:2026-12-25`, { action: "approve" });
    expect(r.ok).toBe(true);
    expect(w.yext.name).toBe("Kahvila Aurora");                                   // sandbox now mirrors this business
    expect((w.yext.hours as { monday: unknown }).monday).toEqual({ openIntervals: [{ start: "08:00", end: "18:00" }] }); // regular hours kept
    expect((w.yext.hours as { holidayHours: unknown[] }).holidayHours).toEqual([{ date: "2026-12-25", isClosed: true }]);
    expect((await getSug(db, `${id}:2026-12-25`))!.status).toBe("applied");
    expect(r.text).toContain("suljettu");                                         // Finnish owner gets Finnish
    expect(r.shows!.map((x) => x.text)).toEqual(["Google (Search & Maps): yleensä 2 min", "Apple Maps: yleensä 2 vrk", "Facebook: ei yhdistetty, ei päivitetty"]);
  });

  it("never writes without a decision, and a failed write changes nothing", async () => {
    const id = await seed(db);
    await sendNow(db, id);
    expect(w.yext.puts).toBe(0);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ meta: { errors: [{ message: "boom" }] } }), { status: 500 }));
    const r = await decide(db, `${id}:2026-12-24`, { action: "approve" });
    expect(r.ok).toBe(false);
    expect((await getSug(db, `${id}:2026-12-24`))!.status).toBe("failed");
  });

  it("edit in plain words: applies the owner's hours, remembers the shift, and adjusts the other open days", async () => {
    const id = await seed(db);
    const r = await decide(db, `${id}:2026-12-24`, { action: "edit", text: "7.30-12" });
    expect(r.ok).toBe(true);
    expect((await getSug(db, `${id}:2026-12-24`))!.finalHours).toBe("07:30-12:00");
    const mem = (await db.select().from(schema.cnMemory).where(eq(schema.cnMemory.dayKey, "XMAS_EVE")).get())!;
    expect([mem.edits, mem.closeShiftMin]).toEqual([1, -60]);
    expect((await getSug(db, `${id}:2026-12-31`))!.proposed).toBe("08:00-15:00");   // open-hours sibling shifted by the same -60 min
    expect((await getSug(db, `${id}:2026-12-25`))!.proposed).toBe("closed");         // "closed" is never shifted
    expect(r.adjusted).toHaveLength(1);
  });

  it("an edit that cannot be understood asks again and changes nothing", async () => {
    const id = await seed(db);
    const r = await decide(db, `${id}:2026-12-24`, { action: "edit", text: "whenever" });
    expect(r.ok).toBe(false); expect(r.needsRetry).toBe(true); expect(w.yext.puts).toBe(0);
  });

  it("decline: nothing is written and that kind of day is not suggested again", async () => {
    const id = await seed(db);
    await decide(db, `${id}:2026-12-24`, { action: "decline" });
    expect(w.yext.puts).toBe(0);
    const biz = (await getBiz(db, id))!;
    expect((await nextItems(db, biz)).map((s) => s.dayKey)).not.toContain("XMAS_EVE");
    expect((await decide(db, `${id}:2026-12-24`, { action: "approve" })).ok).toBe(false); // already decided
  });

  it("a message holds at most four days, soonest first, and never FLAG rows", async () => {
    const sugs = Array.from({ length: 7 }, (_, i) => ({ date: `2026-12-${String(10 + i).padStart(2, "0")}`, key: `K${i}`, proposed: "closed" }));
    const id = await seed(db, { sugs: [...sugs, { date: "2026-12-01", key: "F", proposed: "closed", action: "FLAG" }] });
    const items = await nextItems(db, (await getBiz(db, id))!);
    expect(items.map((s) => s.date)).toEqual(["2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"]);
  });

  it("standing permission applies only high-confidence changes, then they can be undone; nobody else is touched", async () => {
    const id = await seed(db, { standing: 1, sugs: [{ date: "2026-12-24", key: "XMAS_EVE", proposed: "closed", conf: 0.97, tier: "auto" }, { date: "2026-12-31", key: "NYE", proposed: "10:00-14:00", conf: 0.6 }] });
    const done = await autoApplyStanding(db, (await getBiz(db, id))!);
    expect(done.map((d) => d.date)).toEqual(["2026-12-24"]);
    expect((await getSug(db, `${id}:2026-12-31`))!.status).toBe("draft");
    expect((w.yext.hours as { holidayHours: unknown[] }).holidayHours).toHaveLength(1);
    expect((await undoSuggestion(db, done[0])).ok).toBe(true);
    expect((w.yext.hours as { holidayHours: unknown[] }).holidayHours).toHaveLength(0);
    const other = await seed(db, { id: "FI-T0002", standing: 0, sugs: [{ date: "2026-12-24", key: "XMAS_EVE", proposed: "closed", conf: 0.99 }] });
    expect(await autoApplyStanding(db, (await getBiz(db, other))!)).toEqual([]);
  });

  it("an opted-out customer is never contacted, and the model's closed-for-good flags go to a human, not the owner", async () => {
    const id = await seed(db, { optedOut: 1 });
    const r = await sendNow(db, id);
    expect(r).toMatchObject({ ok: false, reason: "opted_out" });
    expect(w.tg).toHaveLength(0); expect(w.mails).toHaveLength(0);
    const f = await seed(db, { id: "FI-T0003", sugs: [{ date: "2026-12-24", key: "XMAS_EVE", proposed: "", action: "FLAG" }] });
    expect(await sendNow(db, f)).toMatchObject({ ok: true, sent: 0 });
    expect(w.mails).toHaveLength(0);
  });

  it("contact: one bundled message in the owner's language by Telegram (with buttons) and email", async () => {
    const id = await seed(db);
    await db.update(schema.cnBusinesses).set({ telegramChatId: "777" }).where(eq(schema.cnBusinesses.id, id)).run();
    const r = await sendNow(db, id);
    expect(r).toMatchObject({ ok: true, sent: 3, delivered: ["telegram", "email"] });
    const send = w.tg.find((x) => x.method === "sendMessage")!;
    expect(String(send.body.text)).toContain("Hei Aleksi!");
    expect(JSON.stringify(send.body.reply_markup)).toContain(`a:${id}:2026-12-24`);
    expect(w.mails[0].subject).toContain("3 aukioloajan muutosta");
    expect((await sugsFor(db, id)).every((s) => s.status === "sent")).toBe(true);
  });
});

describe("telegram", () => {
  it("links a chat from the invitation, then approves and edits by tapping and typing", async () => {
    process.env.YEXT_API_KEY = "k"; process.env.TELEGRAM_BOT_TOKEN = "t"; process.env.RESEND_API_KEY = ""; delete process.env.DEMO_EMAIL; delete process.env.OPENROUTER_API_KEY;
    const db = openTestDb(), w = world();
    const id = await seed(db, { lang: "en" });
    await handleUpdate(db, { message: { chat: { id: 555 }, text: "/start abc12345" } });
    expect((await getBiz(db, id))!.telegramChatId).toBe("555");
    await sendNow(db, id);
    await handleUpdate(db, { callback_query: { id: "cb1", data: `a:${id}:2026-12-25`, message: { chat: { id: 555 }, message_id: 42 } } });
    expect((await getSug(db, `${id}:2026-12-25`))!.status).toBe("applied");
    await handleUpdate(db, { callback_query: { id: "cb2", data: `e:${id}:2026-12-24`, message: { chat: { id: 555 }, message_id: 42 } } });
    await handleUpdate(db, { message: { chat: { id: 555 }, text: "8-12" } });
    expect((await getSug(db, `${id}:2026-12-24`))!.finalHours).toBe("08:00-12:00");
    expect(w.tg.some((x) => x.method === "editMessageText")).toBe(true);
    // someone else's chat cannot decide this business's days
    await handleUpdate(db, { callback_query: { id: "cb3", data: `a:${id}:2026-12-31`, message: { chat: { id: 999 }, message_id: 1 } } });
    expect((await getSug(db, `${id}:2026-12-31`))!.status).toBe("sent");
  });
});
