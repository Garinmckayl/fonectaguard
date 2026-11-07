import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { newId, now } from "@/lib/ids";
import { assess, hoursUntil, inQuietHours, nextStep, runLadder, POLICY } from "@/lib/connect/critical";
import { addRule } from "@/lib/connect/rules";
import { twilioSignature } from "@/lib/connect/sms";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), getDb: async () => (globalThis as unknown as { __testDb: DB }).__testDb }));

const DAY = "2026-12-24", H = 3600_000;
const at = (hoursBefore: number) => Date.parse(`${DAY}T00:00:00Z`) - 2 * H - hoursBefore * H;   // 22:00 Helsinki-time offset: 2 h (winter) -> exactly `hoursBefore` hours before local midnight of DAY
const sug = (o: Partial<{ confidence: number; views: number; proposed: string; shown: string; status: string }> = {}) => ({ id: "s1", date: DAY, action: "SUGGEST", status: o.status ?? "sent", shown: o.shown ?? "08:00-17:00", proposed: o.proposed ?? "closed", confidence: o.confidence ?? 0.9, costJson: { views: o.views ?? 50 } }) as never;

describe("what counts as critical", () => {
  it("counts hours to local midnight of the day", () => { expect(hoursUntil(DAY, "Europe/Helsinki", at(20))).toBeCloseTo(20, 1); });
  it("score = confidence x urgency; far-away days are never critical", () => {
    expect(assess(sug(), "FI", at(20))).toMatchObject({ score: 0.9, critical: true, callEligible: true });
    expect(assess(sug(), "FI", at(40))).toMatchObject({ score: 0.63, critical: true, callEligible: false });   // 0.9 x 0.7
    expect(assess(sug(), "FI", at(70))).toMatchObject({ score: 0.36, critical: false });
    expect(assess(sug(), "FI", at(200))).toMatchObject({ score: 0, critical: false });
  });
  it("a call needs real stakes and time left; unsure or no-change suggestions are never critical", () => {
    expect(assess(sug({ views: 3 }), "FI", at(20))).toMatchObject({ critical: true, callEligible: false });
    expect(assess(sug(), "FI", at(1))).toMatchObject({ callEligible: false });                               // too late to call about it
    expect(assess(sug({ confidence: 0.55 }), "FI", at(20))).toMatchObject({ critical: true, callEligible: false });
    expect(assess(sug({ proposed: "08:00-17:00" }), "FI", at(20))).toBeNull();
    expect(assess(sug({ status: "applied" }), "FI", at(20))).toBeNull();
  });
  it("quiet hours are local", () => { expect(inQuietHours("Europe/Helsinki", Date.parse("2026-12-23T04:00:00Z"))).toBe(true); expect(inQuietHours("Europe/Helsinki", Date.parse("2026-12-23T10:00:00Z"))).toBe(false); });
});

describe("the ladder policy", () => {
  const a = assess(sug(), "FI", at(20))!, tz = "Europe/Helsinki", base = { callsToday: 0, canCall: true };
  const t0 = at(20);
  it("goes contact -> nudge -> voice -> call, each only when its wait has passed", () => {
    expect(nextStep(a, "draft", null, [], t0, tz, base)).toMatchObject({ step: "contact", due: true });
    expect(nextStep(a, "sent", t0 - 1 * H, [], t0, tz, base)).toMatchObject({ step: "nudge", due: false });
    expect(nextStep(a, "sent", t0 - 3.5 * H, [], t0, tz, base)).toMatchObject({ step: "nudge", due: true });
    expect(nextStep(a, "sent", t0 - 9 * H, [{ step: "nudge", outcome: "sent", createdAt: t0 - 5 * H }], t0, tz, base)).toMatchObject({ step: "voice", due: true });
    const past = [{ step: "nudge", outcome: "sent", createdAt: t0 - 9 * H }, { step: "voice", outcome: "sent", createdAt: t0 - 5 * H }];
    expect(nextStep(a, "sent", t0 - 12 * H, past, Date.parse("2026-12-23T10:00:00Z"), tz, base)).toMatchObject({ step: "call", due: true });
    expect(nextStep(a, "sent", t0 - 12 * H, [...past, { step: "call", outcome: "sent", createdAt: t0 }], t0, tz, base)).toBeNull();
  });
  it("never calls in quiet hours, twice in 24 h, or when not eligible", () => {
    const past = [{ step: "nudge", outcome: "sent", createdAt: t0 - 9 * H }, { step: "voice", outcome: "sent", createdAt: t0 - 5 * H }];
    expect(nextStep(a, "sent", t0 - 12 * H, past, Date.parse("2026-12-23T02:00:00Z"), tz, base)).toMatchObject({ step: "call", due: false });
    expect(nextStep(a, "sent", t0 - 12 * H, past, Date.parse("2026-12-23T10:00:00Z"), tz, { ...base, callsToday: 1 })).toMatchObject({ due: false });
    expect(nextStep({ ...a, callEligible: false }, "sent", t0 - 12 * H, past, Date.parse("2026-12-23T10:00:00Z"), tz, base)).toMatchObject({ due: false });
    expect(nextStep({ ...a, critical: false }, "sent", t0 - 12 * H, [], t0, tz, base)).toBeNull();
  });
});

describe("running the ladder", () => {
  let db: DB; const calls: { telegram: string[]; sms: string[]; voices: number; twilioCalls: string[] } = { telegram: [], sms: [], voices: 0, twilioCalls: [] };
  beforeEach(async () => {
    Object.assign(process.env, { TELEGRAM_BOT_TOKEN: "t", ELEVENLABS_API_KEY: "e", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+3580000", DEMO_PHONE: "+358401111111", APP_URL: "https://x.test", YEXT_API_KEY: "k" });
    calls.telegram = []; calls.sms = []; calls.voices = 0; calls.twilioCalls = [];
    vi.stubGlobal("fetch", async (url: string, init?: { body?: unknown }) => {
      const u = new URL(url);
      if (u.hostname === "api.telegram.org") { const m = u.pathname.split("/").pop()!; if (m === "sendVoice") { calls.voices++; return new Response(JSON.stringify({ ok: true, result: {} })); } calls.telegram.push(String((init?.body as string) ?? "")); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })); }
      if (u.hostname === "api.elevenlabs.io") return new Response(new Uint8Array([1]));
      if (u.hostname === "api.twilio.com") { if (u.pathname.endsWith("Calls.json")) { calls.twilioCalls.push(String(init?.body)); return new Response(JSON.stringify({ sid: "CA1" }), { status: 201 }); } calls.sms.push(String(init?.body)); return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }); }
      return new Response("{}", { status: 404 });
    });
    db = openTestDb(); (globalThis as unknown as { __testDb: DB }).__testDb = db;
    await db.insert(schema.cnBusinesses).values({ id: "FI-C1", name: "Pub Kulma", country: "FI", language: "en", channel: "TELEGRAM", linkCode: "c", telegramChatId: "55", createdAt: now() }).run();
    await db.insert(schema.cnSuggestions).values({ id: "s1", businessId: "FI-C1", date: DAY, dayKey: "XMAS_EVE", action: "SUGGEST", shown: "16:00-23:00", proposed: "closed", confidence: 0.93, tier: "one_tap", basis: "x", reasonsJson: [], viewsEst: 1, costJson: { views: 60 }, status: "sent", token: "tok1", sentAt: at(30), createdAt: now() }).run();
  });

  it("escalates one step per run and ends in a real call to the demo number only", async () => {
    const steps: string[] = [];
    for (let i = 0; i < 4; i++) { const r = await runLadder(db, "FI-C1", { asOf: at(20), demo: true }); steps.push(...r.map((x) => `${x.step}:${x.outcome}`)); }
    expect(steps).toEqual(["nudge:sent", "voice:sent", "call:sent"]);
    expect(calls.voices).toBe(1);
    expect(calls.twilioCalls).toHaveLength(1);
    expect(calls.twilioCalls[0]).toContain(encodeURIComponent("+358401111111")); expect(calls.twilioCalls[0]).toContain("api%2Fconnect%2Fvoice%3Fs%3Ds1%26k%3Dtok1");
  });
  it("owner rules and opt-outs stop the whole ladder", async () => {
    await addRule(db, "FI-C1", { kind: "never_closed", weekday: "thursday" });
    expect(await runLadder(db, "FI-C1", { asOf: at(20), demo: true })).toEqual([]);
    await db.delete(schema.cnRules).run();
    await db.update(schema.cnBusinesses).set({ optedOut: 1 }).where(eq(schema.cnBusinesses.id, "FI-C1")).run();
    expect(await runLadder(db, "FI-C1", { asOf: at(20), demo: true })).toEqual([]);
    expect(calls.twilioCalls).toHaveLength(0);
  });
  it("without telephony it says so instead of pretending", async () => {
    delete process.env.TWILIO_ACCOUNT_SID; delete process.env.ELKS_USERNAME;
    const out: string[] = [];
    for (let i = 0; i < 3; i++) out.push(...(await runLadder(db, "FI-C1", { asOf: at(20), demo: true })).map((x) => `${x.step}:${x.outcome}`));
    expect(out.at(-1)).toBe("call:skipped");
    expect(calls.twilioCalls).toHaveLength(0);
  });
  it("the call webhook needs Twilio's signature, then approving by keypress applies the change", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => { const u = new URL(url); if (u.hostname === "sbx-api.yextapis.com") { const e = { name: "Pub Kulma", hours: { holidayHours: init?.method === "PUT" ? JSON.parse(init.body!).hours.holidayHours : [] }, meta: { id: "SinceAI16" } }; return new Response(JSON.stringify({ response: e })); } return new Response("{}", { status: 404 }); });
    process.env.YEXT_ENTITY_ID = "SinceAI16";
    const { POST } = await import("@/app/api/connect/voice/route");
    const q = "?s=s1&k=tok1", url = `https://x.test/api/connect/voice${q}`;
    const mk = (params: Record<string, string>, sig?: string) => new Request(url, { method: "POST", body: new URLSearchParams(params).toString(), headers: { "x-twilio-signature": sig ?? twilioSignature(url, params, "tok"), "content-type": "application/x-www-form-urlencoded" } });
    expect((await POST(mk({ CallSid: "CA1" }, "bad"))).status).toBe(403);
    const hello = await (await POST(mk({ CallSid: "CA1" }))).text();
    expect(hello).toContain("<Gather"); expect(hello).toContain("automated call from Fonecta Connect");
    expect(await (await POST(new Request(`https://x.test/api/connect/voice?s=s1&k=WRONG`, { method: "POST", body: "", headers: { "x-twilio-signature": twilioSignature("https://x.test/api/connect/voice?s=s1&k=WRONG", {}, "tok") } }))).text()).toContain("<Hangup/>");
    const yes = await (await POST(mk({ CallSid: "CA1", Digits: "1" }))).text();
    expect(yes).toContain("approved");
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "s1")).get())!.status).toBe("applied");
    void POLICY;
  });
});

describe("46elks as the telephony provider", () => {
  let db: DB; const seen: { url: string; body: string; auth: string }[] = [];
  beforeEach(async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    Object.assign(process.env, { ELKS_USERNAME: "u1", ELKS_PASSWORD: "p1", ELKS_FROM: "+46700000001", DEMO_PHONE: "+358401111111", APP_URL: "https://x.test", ELEVENLABS_API_KEY: "e", YEXT_API_KEY: "k", YEXT_ENTITY_ID: "SinceAI16" }); seen.length = 0;
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
      const u = new URL(url);
      if (u.hostname === "api.46elks.com") { seen.push({ url, body: String(init?.body), auth: init?.headers?.authorization ?? "" }); return new Response(JSON.stringify({ id: "c1", state: "ongoing" })); }
      if (u.hostname === "api.elevenlabs.io") { seen.push({ url, body: String(init?.body), auth: "" }); return new Response(new Uint8Array([1, 2])); }
      if (u.hostname === "sbx-api.yextapis.com") { const e = { name: "Pub Kulma", hours: { holidayHours: init?.method === "PUT" ? JSON.parse(init.body!).hours.holidayHours : [] }, meta: { id: "SinceAI16" } }; return new Response(JSON.stringify({ response: e })); }
      return new Response("{}", { status: 404 });
    });
    db = openTestDb(); (globalThis as unknown as { __testDb: DB }).__testDb = db;
    await db.insert(schema.cnBusinesses).values({ id: "FI-C2", name: "Pub Kulma", country: "FI", language: "fi", channel: "SMS", linkCode: "c", createdAt: now() }).run();
    await db.insert(schema.cnSuggestions).values({ id: "s2", businessId: "FI-C2", date: DAY, dayKey: "XMAS_EVE", action: "SUGGEST", shown: "16:00-23:00", proposed: "closed", confidence: 0.93, tier: "one_tap", basis: "x", reasonsJson: [], viewsEst: 1, costJson: { views: 60 }, status: "sent", token: "tok2", sentAt: at(30), createdAt: now() }).run();
  });
  const call = (path: string, q: string, body: Record<string, string> = {}, ip?: string) => import(`@/app/api/connect/elks/${path}/route`).then((m) => (path === "voice" ? m.POST : m.GET)(new Request(`https://x.test/api/connect/elks/${path}${q}`, { method: path === "voice" ? "POST" : "GET", body: path === "voice" ? new URLSearchParams(body).toString() : undefined, headers: ip ? { "cf-connecting-ip": ip } : {} })) as Promise<Response>);

  it("places the call through 46elks, to the demo number only, pointing at our capability URL", async () => {
    for (let i = 0; i < 3; i++) await runLadder(db, "FI-C2", { asOf: at(20), demo: true }).catch(() => undefined);
    const c = seen.find((x) => x.url.includes("/a1/calls"))!;
    expect(c).toBeTruthy();
    const f = new URLSearchParams(c.body);
    expect(f.get("to")).toBe("+358401111111"); expect(f.get("from")).toBe("+46700000001");
    expect(f.get("voice_start")).toBe("https://x.test/api/connect/elks/voice?s=s2&k=tok2&step=start");
    expect(c.auth).toBe(`Basic ${Buffer.from("u1:p1").toString("base64")}`);
  });
  it("the webhook asks one question, then 1 approves (applied in Yext) and 2 leaves it", async () => {
    const q = "?s=s2&k=tok2", start = await (await call("voice", `${q}&step=start`)).json();
    expect(start).toMatchObject({ digits: 1, ivr: "https://x.test/api/connect/elks/audio?s=s2&k=tok2&t=ask" });
    const yes = (await (await call("voice", `${q}&step=digit`, { result: "1" })).json()) as { play: string };
    expect(yes.play).toContain("t=yes");
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "s2")).get())!.status).toBe("applied");
    await db.update(schema.cnSuggestions).set({ status: "sent" }).where(eq(schema.cnSuggestions.id, "s2")).run();
    expect(((await (await call("voice", `${q}&step=digit`, { result: "2" })).json()) as { play: string }).play).toContain("t=done");
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "s2")).get())!.status).toBe("kept");
  });
  it("no key or silence applies nothing; wrong token or foreign IP is refused", async () => {
    const q = "?s=s2&k=tok2";
    expect(((await (await call("voice", `${q}&step=digit`, { result: "failed", why: "noinput" })).json()) as { play: string }).play).toContain("t=no");
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "s2")).get())!.status).toBe("sent");
    expect((await call("voice", `${q}&step=start`, {}, "1.2.3.4")).status).toBe(403);
    expect(await (await call("voice", "?s=s2&k=WRONG&step=start")).json()).toEqual({ hangup: "reject" });
    expect((await call("voice", `${q}&step=start`, {}, "176.10.154.199")).status).toBe(200);
  });
  it("the audio is Finnish ElevenLabs speech, served only with the capability", async () => {
    const ok = await call("audio", "?s=s2&k=tok2&t=ask");
    expect(ok.headers.get("content-type")).toBe("audio/mpeg");
    const said = JSON.parse(seen.find((x) => x.url.includes("elevenlabs"))!.body).text as string;
    expect(said).toContain("Fonecta Connect"); expect(said).toContain("Paina 1");
    expect((await call("audio", "?s=s2&k=nope&t=ask")).status).toBe(404);
  });
});

describe("Vonage as the telephony provider", () => {
  let db: DB; const seen: { url: string; body: string; auth: string }[] = []; let pem = "", pub: import("crypto").KeyObject;
  beforeEach(async () => {
    const { generateKeyPairSync } = await import("crypto");
    const kp = generateKeyPairSync("rsa", { modulusLength: 2048 }); pub = kp.publicKey; pem = kp.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    for (const k of ["TWILIO_ACCOUNT_SID", "ELKS_USERNAME"]) delete process.env[k];
    Object.assign(process.env, { VONAGE_APP_ID: "app-1", VONAGE_PRIVATE_KEY: pem.replace(/\n/g, "\\n"), VONAGE_FROM: "+358401234000", DEMO_PHONE: "+358401111111", APP_URL: "https://x.test", ELEVENLABS_API_KEY: "e", YEXT_API_KEY: "k", YEXT_ENTITY_ID: "SinceAI16" }); seen.length = 0;
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
      const u = new URL(url);
      if (u.hostname === "api.nexmo.com") { seen.push({ url, body: String(init?.body), auth: init?.headers?.authorization ?? "" }); return new Response(JSON.stringify({ uuid: "v1", status: "started" }), { status: 201 }); }
      if (u.hostname === "sbx-api.yextapis.com") { const e = { name: "Pub", hours: { holidayHours: init?.method === "PUT" ? JSON.parse(init.body!).hours.holidayHours : [] }, meta: { id: "SinceAI16" } }; return new Response(JSON.stringify({ response: e })); }
      return new Response("{}", { status: 404 });
    });
    db = openTestDb(); (globalThis as unknown as { __testDb: DB }).__testDb = db;
    await db.insert(schema.cnBusinesses).values({ id: "FI-C3", name: "Pub Kulma", country: "FI", language: "en", channel: "SMS", linkCode: "c", createdAt: now() }).run();
    await db.insert(schema.cnSuggestions).values({ id: "s3", businessId: "FI-C3", date: DAY, dayKey: "XMAS_EVE", action: "SUGGEST", shown: "16:00-23:00", proposed: "closed", confidence: 0.93, tier: "one_tap", basis: "x", reasonsJson: [], viewsEst: 1, costJson: { views: 60 }, status: "sent", token: "tok3", sentAt: at(30), createdAt: now() }).run();
  });
  it("signs a valid RS256 JWT for the application and calls the demo number only", async () => {
    for (let i = 0; i < 3; i++) await runLadder(db, "FI-C3", { asOf: at(20), demo: true }).catch(() => undefined);
    const c = seen.find((x) => x.url.endsWith("/v1/calls"))!;
    expect(c).toBeTruthy();
    const b = JSON.parse(c.body);
    expect(b.to).toEqual([{ type: "phone", number: "358401111111" }]); expect(b.from.number).toBe("358401234000");
    expect(b.answer_url[0]).toBe("https://x.test/api/connect/vonage/answer?s=s3&k=tok3");
    const [h, p, sig] = c.auth.replace("Bearer ", "").split(".");
    expect(JSON.parse(Buffer.from(p, "base64url").toString()).application_id).toBe("app-1");
    const { createVerify } = await import("crypto");
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(pub, Buffer.from(sig, "base64url"))).toBe(true);
  });
  it("answer plays the question then waits for a key; 1 approves, 2 keeps, silence applies nothing", async () => {
    const ans = (await import("@/app/api/connect/vonage/answer/route")).POST, dt = (await import("@/app/api/connect/vonage/dtmf/route")).POST;
    const hello = (await (await ans(new Request("https://x.test/api/connect/vonage/answer?s=s3&k=tok3", { method: "POST" }))).json()) as { action: string; streamUrl?: string[]; dtmf?: unknown }[];
    expect(hello.map((a) => a.action)).toEqual(["stream", "input"]); expect(hello[0].streamUrl![0]).toContain("t=ask");
    expect(await (await ans(new Request("https://x.test/api/connect/vonage/answer?s=s3&k=bad", { method: "POST" }))).json()).toEqual([]);
    const press = (d: unknown, k = "tok3") => dt(new Request(`https://x.test/api/connect/vonage/dtmf?s=s3&k=${k}`, { method: "POST", body: JSON.stringify({ dtmf: d }) }));
    expect(JSON.stringify(await (await press({ digits: "", timed_out: true })).json())).toContain("t=no");
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "s3")).get())!.status).toBe("sent");
    expect(JSON.stringify(await (await press({ digits: "1", timed_out: false })).json())).toContain("t=yes");
    expect((await db.select().from(schema.cnSuggestions).where(eq(schema.cnSuggestions.id, "s3")).get())!.status).toBe("applied");
    expect(await (await press("1", "wrong")).json()).toEqual([]);
  });
});
