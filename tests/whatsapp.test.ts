import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { newId, now } from "@/lib/ids";
import { sendNow } from "@/lib/connect/deliver";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), getDb: async () => (globalThis as unknown as { __testDb: DB }).__testDb }));

describe("WhatsApp: suggestions out, replies in", () => {
  let db: DB, llmCalls = 0, llm: () => unknown = () => ({ intent: "other", answer: "Anything else I can help with?" }); const sent: { to: string; text: string; auth: string; from: string }[] = [];
  beforeEach(async () => {
    Object.assign(process.env, { VONAGE_API_KEY: "key1", VONAGE_API_SECRET: "sec1", DEMO_PHONE: "+251953926116", WA_WEBHOOK_KEY: "hook-secret", APP_URL: "https://x.test", YEXT_API_KEY: "k", YEXT_ENTITY_ID: "SinceAI16" });
    for (const k of ["TWILIO_ACCOUNT_SID", "TELEGRAM_BOT_TOKEN", "RESEND_API_KEY", "DEMO_EMAIL"]) delete process.env[k];
    sent.length = 0; llmCalls = 0; llm = () => ({ intent: "other", answer: "Anything else I can help with?" });
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
      const u = new URL(url);
      if (u.hostname === "messages-sandbox.nexmo.com") { const b = JSON.parse(init!.body!); sent.push({ to: b.to, text: b.text, auth: init!.headers!.authorization, from: b.from }); expect(b.channel).toBe("whatsapp"); return new Response(JSON.stringify({ message_uuid: "m1" }), { status: 202 }); }
      if (u.hostname === "openrouter.ai") { llmCalls++; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(llm()) } }] })); }
      if (u.hostname === "sbx-api.yextapis.com") { const e = { name: "Kahvila Aurora", hours: { holidayHours: init?.method === "PUT" ? JSON.parse(init.body!).hours.holidayHours : [] }, meta: { id: "SinceAI16" } }; return new Response(JSON.stringify({ response: e })); }
      return new Response("{}", { status: 404 });
    });
    db = openTestDb(); (globalThis as unknown as { __testDb: DB }).__testDb = db;
    await db.insert(schema.cnBusinesses).values({ id: "FI-W1", name: "Kahvila Aurora", city: "Helsinki", country: "FI", language: "en", channel: "SMS", contactName: "Aleksi", linkCode: "c", publishersJson: [{ name: "Google", status: "LIVE", seconds: 120 }], createdAt: now() }).run();
    await db.insert(schema.cnSuggestions).values({ id: "w1", businessId: "FI-W1", date: "2026-12-24", dayKey: "XMAS_EVE", action: "SUGGEST", shown: "07:30-18:00", proposed: "07:30-13:00", confidence: 0.9, tier: "one_tap", basis: "last_year", reasonsJson: [{ k: "last_year", hours: "07:30-13:00" }] as never, viewsEst: 1, status: "draft", token: "t1", createdAt: now() }).run();
  });
  const inbound = async (text: string, k = "hook-secret", uuid?: string) => (await import("@/app/api/connect/whatsapp/route")).POST(new Request(`https://x.test/api/connect/whatsapp?k=${k}`, { method: "POST", body: JSON.stringify({ channel: "whatsapp", from: "251953926116", message_type: "text", text, message_uuid: uuid ?? `u${Math.random()}` }) }));

  it("the contact step sends the suggestion over WhatsApp to the demo number, with the reply instructions", async () => {
    const r = await sendNow(db, "FI-W1");
    expect(r.ok && r.delivered).toContain("whatsapp");
    expect(sent[0]).toMatchObject({ to: "251953926116", from: "14157386102", auth: `Basic ${Buffer.from("key1:sec1").toString("base64")}` });
    expect(sent[0].text).toContain("Kahvila Aurora"); expect(sent[0].text).toContain("07:30–13:00"); expect(sent[0].text).toContain("Reply *OK*"); expect(sent[0].text).toContain("*1 · "); expect(sent[0].text).toContain("Last year you entered");
  });
  it("replying OK on WhatsApp approves the change in Yext and answers on WhatsApp; a wrong secret is refused", async () => {
    await sendNow(db, "FI-W1"); sent.length = 0;
    expect((await inbound("OK", "wrong")).status).toBe(403);
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "w1")).get())!.status).toBe("sent");
    await inbound("OK");
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "w1")).get())!.status).toBe("applied");
    expect(sent).toHaveLength(1); expect(sent[0].to).toBe("251953926116"); expect(sent[0].text).toContain("07:30");
  });
  it("NO declines, and chatter with no open suggestion gets a polite answer, nothing applied", async () => {
    await sendNow(db, "FI-W1"); sent.length = 0;
    await inbound("NO 1");
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "w1")).get())!.status).toBe("declined");
  });
  it("a message Vonage delivers twice is handled once (no second, confused reply)", async () => {
    await sendNow(db, "FI-W1"); sent.length = 0;
    await inbound("OK", "hook-secret", "dup-1"); const after1 = sent.length;
    await inbound("OK", "hook-secret", "dup-1");
    expect(sent.length).toBe(after1);
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "w1")).get())!.status).toBe("applied");
  });
  it("with nothing waiting, OK and free text go to the agent instead of a canned reply", async () => {
    await sendNow(db, "FI-W1"); await inbound("OK"); sent.length = 0; llmCalls = 0;
    await inbound("OK");
    expect(llmCalls).toBe(1); expect(sent[0].text).toBe("Anything else I can help with?");
  });
  it("free text becomes a proposal that waits for YES; YES applies it, NO cancels it", async () => {
    await sendNow(db, "FI-W1"); await inbound("NO 1"); sent.length = 0;
    llm = () => ({ intent: "change", answer: "Got it.", changes: [{ type: "special_hours", date: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10), hours: "10:00-14:00" }] });
    await inbound("open 10 to 2 five days from now");
    expect(sent[0].text).toContain("Reply YES to apply");
    let rec = (await db.select().from(schema.cnChanges).all())[0];
    expect(rec.status).toBe("proposed");
    await inbound("no");
    expect((await db.select().from(schema.cnChanges).all())[0].status).toBe("declined");
    await inbound("open 10 to 2 five days from now");
    await inbound("YES");
    rec = (await db.select().from(schema.cnChanges).all()).find((x) => x.status === "applied")!;
    expect(rec).toBeTruthy(); expect(sent.at(-1)!.text).toContain("✅");
  });
  it("a photo is read by the agent", async () => {
    await sendNow(db, "FI-W1"); sent.length = 0;
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => { const u = new URL(url); if (u.hostname === "media.test") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-length": "3" } }); if (u.hostname === "openrouter.ai") { expect(init!.body).toContain("data:image/jpeg;base64"); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: "other", answer: "I see a sign." }) } }] })); } return new Response(JSON.stringify({ message_uuid: "m" }), { status: 202 }); });
    await (await import("@/lib/connect/whatsapp-bot")).handleWhatsapp(db, { from: "251953926116", type: "image", image: { url: "https://media.test/p.jpg" } });
  });
  void newId;
});
