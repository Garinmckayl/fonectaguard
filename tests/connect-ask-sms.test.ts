import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { newId, now } from "@/lib/ids";
import { autoApplyStanding, decide, getBiz, getSug } from "@/lib/connect/service";
import { sendNow } from "@/lib/connect/deliver";
import { handleUpdate } from "@/lib/connect/telegram-bot";
import { costText, type Cost } from "@/lib/connect/cost";
import { parseSms, twilioSignature, validTwilio } from "@/lib/connect/sms";
import { handleSms } from "@/lib/connect/sms-bot";

const PUBS = [{ name: "Google (Search & Maps)", status: "LIVE", seconds: 120 }, { name: "Apple Maps", status: "LIVE", seconds: 172800 }];
const PHONE = "+358401234567";

function world() {
  const yext = { name: "x", hours: undefined as Record<string, unknown> | undefined, puts: 0 };
  const tg: { method: string; body: Record<string, unknown> }[] = [], sms: { to: string; body: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
    const u = new URL(url);
    if (u.hostname === "sbx-api.yextapis.com") {
      if (init?.method === "PUT") { const b = JSON.parse(init.body!); yext.puts++; if (b.name) yext.name = b.name; if (b.hours) yext.hours = b.hours; }
      return new Response(JSON.stringify({ response: { name: yext.name, hours: yext.hours, meta: { id: "SinceAI16" } } }), { status: 200 });
    }
    if (u.hostname === "api.telegram.org") { tg.push({ method: u.pathname.split("/").pop()!, body: JSON.parse(init!.body!) }); return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }); }
    if (u.hostname === "api.twilio.com") { const b = Object.fromEntries(new URLSearchParams(init!.body!)); sms.push({ to: b.To, body: b.Body }); return new Response(JSON.stringify({ sid: `SM${sms.length}` }), { status: 201 }); }
    return new Response("{}", { status: 404 });
  });
  return { yext, tg, sms };
}

type S = { date: string; key: string; proposed: string; conf?: number; tier?: string; options?: string[]; cost?: Cost };
async function seed(db: DB, o: { lang?: string; standing?: number; sugs: S[] }) {
  const id = "FI-T0100";
  await db.insert(schema.cnBusinesses).values({ id, name: "Kahvila Aurora", city: "Helsinki", country: "FI", segment: "cafe", language: o.lang ?? "en", channel: "SMS", contactName: "Aleksi", standing: o.standing ?? 0, optedOut: 0, linkCode: "abc12345", publishersJson: PUBS, regularJson: null, createdAt: now() }).run();
  for (const s of o.sugs) await db.insert(schema.cnSuggestions).values({ id: `${id}:${s.date}`, businessId: id, date: s.date, dayKey: s.key, action: "SUGGEST", shown: "08:00-18:00", proposed: s.proposed, confidence: s.conf ?? 0.85, tier: s.tier ?? "one_tap", optionsJson: s.options ?? null, costJson: (s.cost ?? null) as Record<string, unknown> | null, basis: "last_year", reasonsJson: [{ k: "last_year", hours: s.proposed }] as unknown as string[], viewsEst: 10, status: "draft", token: newId(), createdAt: now() }).run();
  return id;
}

const ASK: S = { date: "2026-12-31", key: "NYE", proposed: "10:00-15:00", conf: 0.7, tier: "ask", options: ["10:00-15:00", "closed"] };
const COST: Cost = { views: 120, ly_date: "2025-12-31", ly_views: 110, ly_actions: 9, ly_calls: 3, late: null, reviews: { n: 1, quote: "Came on New Year's Eve and the door was locked", rating: 1 } };

beforeEach(() => {
  process.env.YEXT_API_KEY = "k";
  for (const k of ["TELEGRAM_BOT_TOKEN", "DEMO_EMAIL", "OPENROUTER_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "DEMO_PHONE"]) delete process.env[k];
});
const withTwilio = () => Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM: "+15550000", DEMO_PHONE: PHONE });

describe("confidence tiers", () => {
  it("autopilot takes only the auto tier, even for a one-tap suggestion above 0.9", async () => {
    const db = openTestDb(); world();
    const id = await seed(db, { standing: 1, sugs: [{ date: "2026-12-24", key: "XMAS_EVE", proposed: "closed", conf: 0.97, tier: "auto" }, { date: "2026-12-26", key: "BOXING", proposed: "closed", conf: 0.93 }, { ...ASK, conf: 0.99 }] });
    expect((await autoApplyStanding(db, (await getBiz(db, id))!)).map((s) => s.date)).toEqual(["2026-12-24"]);
  });

  it("an ask item: picking an option applies it; 'keep' writes nothing and is remembered, not counted as a decline", async () => {
    const db = openTestDb(), w = world();
    const id = await seed(db, { sugs: [ASK, { ...ASK, date: "2026-12-26", key: "BOXING" }] });
    await sendNow(db, id);
    expect((await decide(db, `${id}:2026-12-31`, { action: "choose", option: 1 })).suggestion).toMatchObject({ status: "applied", finalHours: "closed" });
    const puts = w.yext.puts;
    expect(await decide(db, `${id}:2026-12-26`, { action: "choose", option: 2 })).toMatchObject({ ok: true, suggestion: { status: "kept", finalHours: "08:00-18:00" } });
    expect(w.yext.puts).toBe(puts);
    expect(await db.select().from(schema.cnMemory).where(eq(schema.cnMemory.dayKey, "BOXING")).get()).toMatchObject({ lastHours: "08:00-18:00", declines: 0 });
  });

  it("Telegram: one button per option plus keep, and 'approve all' never answers a question for the owner", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "t";
    const db = openTestDb(), w = world();
    const id = await seed(db, { sugs: [{ date: "2026-12-24", key: "XMAS_EVE", proposed: "closed" }, { date: "2026-12-25", key: "XMAS", proposed: "closed" }, ASK] });
    await db.update(schema.cnBusinesses).set({ telegramChatId: "555" }).where(eq(schema.cnBusinesses.id, id)).run();
    const r = await sendNow(db, id);
    const kb = JSON.stringify(w.tg.find((x) => x.method === "sendMessage")!.body.reply_markup);
    expect(kb).toContain(`o:${id}:2026-12-31:0`); expect(kb).toContain(`o:${id}:2026-12-31:2`); expect(kb).toContain("(2)");
    await handleUpdate(db, { callback_query: { id: "x", data: `all:${(r as { messageId: string }).messageId}`, message: { chat: { id: 555 }, message_id: 42 } } });
    expect((await getSug(db, `${id}:2026-12-24`))!.status).toBe("applied");
    expect((await getSug(db, `${id}:2026-12-31`))!.status).toBe("sent");
    await handleUpdate(db, { callback_query: { id: "y", data: `o:${id}:2026-12-31:1`, message: { chat: { id: 555 }, message_id: 42 } } });
    expect(await getSug(db, `${id}:2026-12-31`)).toMatchObject({ status: "applied", finalHours: "closed" });
  });
});

describe("cost of wrong hours", () => {
  it("uses the business's own numbers in its language, and says nothing when there is nothing to say", () => {
    expect(costText(COST, "08:00-18:00", "closed", "en")).toBe("If nothing changes, Google will tell about 120 people that you are open. Last year a review after this day mentioned a closed door: “Came on New Year's Eve and the door was locked”");
    expect(costText(COST, "closed", "10:00-14:00", "fi")).toContain("noin 120 ihmistä voi mennä muualle");
    expect(costText({ ...COST, reviews: null, late: { entered: "2025-12-30", shown: "08:00-18:00" } }, "x", "y", "sv")).toContain("först 30 december");
    expect(costText({ ...COST, views: 2, ly_views: 2, reviews: null }, "x", "closed", "en")).toBeNull();
    expect(costText(null, "x", "closed", "en")).toBeNull();
  });
});

describe("sms", () => {
  it("reads replies in all four languages", () => {
    expect(parseSms("ok")).toEqual({ k: "all" }); expect(parseSms("Joo!")).toEqual({ k: "all" }); expect(parseSms("ja")).toEqual({ k: "all" });
    expect(parseSms("2")).toEqual({ k: "approve", n: 2 }); expect(parseSms("3b")).toEqual({ k: "choose", n: 3, opt: 1 });
    expect(parseSms("1 10-15")).toEqual({ k: "edit", n: 1, text: "10-15" }); expect(parseSms("2 suljettu")).toEqual({ k: "edit", n: 2, text: "suljettu" });
    expect(parseSms("ei 2")).toEqual({ k: "decline", n: 2 }); expect(parseSms("NEJ")).toEqual({ k: "decline", n: null });
    expect(parseSms("kumoa a1")).toEqual({ k: "undo", n: 1 }); expect(parseSms("STOP")).toEqual({ k: "stop" }); expect(parseSms("what?")).toEqual({ k: "help" });
  });

  it("accepts only Twilio-signed requests", () => {
    process.env.TWILIO_AUTH_TOKEN = "secret";
    const url = "https://x.test/api/connect/sms", p = { From: PHONE, Body: "OK" };
    expect(validTwilio(url, p, twilioSignature(url, p))).toBe(true);
    expect(validTwilio(url, { ...p, Body: "NO" }, twilioSignature(url, p))).toBe(false);
    expect(validTwilio(url, p, null)).toBe(false);
  });

  it("texts a numbered message to the demo phone; OK, 2B, UNDO, nonsense and STOP all work by reply", async () => {
    withTwilio();
    const db = openTestDb(), w = world();
    const id = await seed(db, { sugs: [{ date: "2026-12-24", key: "XMAS_EVE", proposed: "closed", cost: COST }, { ...ASK, cost: COST }, { date: "2027-01-06", key: "EPIPHANY", proposed: "10:00-14:00" }] });
    expect((await sendNow(db, id)).delivered).toContain("sms");
    expect(w.sms[0].to).toBe(PHONE);
    expect(w.sms[0].body).toContain("2B closed / 2C as now"); expect(w.sms[0].body).toContain("Reply OK to approve 1,3"); expect(w.sms[0].body).toContain("about 120 people");
    expect(await handleSms(db, PHONE, "OK")).toContain("Google (Search & Maps)");
    expect((await getSug(db, `${id}:2026-12-24`))!.status).toBe("applied");
    expect((await getSug(db, `${id}:2027-01-06`))!.status).toBe("applied");
    expect((await getSug(db, `${id}:2026-12-31`))!.status).toBe("sent");
    await handleSms(db, PHONE, "2B");
    expect(await getSug(db, `${id}:2026-12-31`)).toMatchObject({ status: "applied", finalHours: "closed" });
    await handleSms(db, PHONE, "UNDO 1");
    expect((await getSug(db, `${id}:2026-12-24`))!.status).toBe("undone");
    expect(await handleSms(db, PHONE, "banana")).toContain("Reply OK");
    expect(await handleSms(db, "+0000", "OK")).toContain("no open suggestions");
    await handleSms(db, PHONE, "STOP");
    expect((await getBiz(db, id))!.optedOut).toBe(1);
  });

  it("autopilot texts what it changed as A1..; UNDO A1 reverts it without touching the numbered suggestions", async () => {
    withTwilio();
    const db = openTestDb(), w = world();
    const id = await seed(db, { standing: 1, sugs: [{ date: "2026-12-24", key: "XMAS_EVE", proposed: "closed", conf: 0.98, tier: "auto" }, { date: "2026-12-31", key: "NYE", proposed: "10:00-14:00" }] });
    await sendNow(db, id);
    expect(w.sms[0].body).toContain("A1) "); expect(w.sms[0].body).toContain('"UNDO A1"');
    await handleSms(db, PHONE, "1 10-13");
    expect((await getSug(db, `${id}:2026-12-31`))!.finalHours).toBe("10:00-13:00");
    await handleSms(db, PHONE, "UNDO A1");
    expect((await getSug(db, `${id}:2026-12-24`))!.status).toBe("undone");
    expect((await getSug(db, `${id}:2026-12-31`))!.status).toBe("applied");
  });
});
