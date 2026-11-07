import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { schema, type DB } from "../db";
import { newId, now } from "../ids";
import { asLang, fmtDate, fmtHours, T, type Lang } from "./i18n";
import { appUrl, getBiz, log, sugsFor, type Biz, type Sug } from "./service";
import { hasTelegram, say, sendVoice } from "./telegram";
import { hasVoice, speak } from "./elevenlabs";
import { hasSms, sendSms } from "./sms";
import { demoPhone, dial, hasCalls } from "./calls";
import { sendNow } from "./deliver";
import { hasWhatsapp, sendWhatsapp } from "./whatsapp";
import { dateViolation, loadRules } from "./rules";
import { toPlan } from "./service";

/**
 * Critical findings and the escalation ladder.
 * The "decision" is a transparent, tested policy over the hours model's calibrated confidence:
 *   score = confidence x urgency(hours until the day starts).  Critical at >= 0.5; a phone call needs >= 0.75,
 *   real stakes (views that day) and a reachable number. Everything is a typed output (scenario, score, level), no free text.
 * Ladder: message -> nudge (reminder) -> voice note -> phone call. One step per run, each step only when due.
 */
export const POLICY = { critical: 0.5, call: 0.75, callMinViews: 20, nudgeAfterH: 3, voiceAfterH: 4, callAfterH: 4, quietFrom: 8, quietTo: 20, callMinHoursLeft: 2, horizonH: 72 } as const;
export type Step = "contact" | "nudge" | "voice" | "call";
const LADDER: Step[] = ["nudge", "voice", "call"];
const TZ: Record<string, string> = { FI: "Europe/Helsinki", SE: "Europe/Stockholm", NO: "Europe/Oslo" };

export interface Assessment { scenario: "hours_imminent"; sugId: string; date: string; score: number; critical: boolean; callEligible: boolean; hoursUntil: number; views: number }

/** Local wall-clock parts for an instant. */
function localParts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
  const g = (t: string) => Number(f.find((x) => x.type === t)!.value);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute") };
}
/** Hours from `nowMs` until the given local date starts (negative once it has started). */
export function hoursUntil(date: string, tz: string, nowMs: number): number {
  const p = localParts(nowMs, tz), nowLocal = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi), [y, m, d] = date.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - nowLocal) / 3.6e6;
}
export const urgency = (h: number) => (h <= 24 ? 1 : h <= 48 ? 0.7 : h <= POLICY.horizonH ? 0.4 : 0);
export const inQuietHours = (tz: string, nowMs: number) => { const h = localParts(nowMs, tz).h; return h < POLICY.quietFrom || h >= POLICY.quietTo; };

export function assess(s: Pick<Sug, "id" | "date" | "action" | "status" | "shown" | "proposed" | "confidence" | "costJson">, country: string, nowMs: number): Assessment | null {
  if (s.action !== "SUGGEST" || !s.proposed || s.proposed === s.shown || !["draft", "sent"].includes(s.status)) return null;
  const h = hoursUntil(s.date, TZ[country] ?? "Europe/Helsinki", nowMs), score = Math.round(s.confidence * urgency(h) * 100) / 100;
  const views = Number((s.costJson as { views?: number } | null)?.views ?? 0);
  return { scenario: "hours_imminent", sugId: s.id, date: s.date, score, hoursUntil: Math.round(h * 10) / 10, views, critical: score >= POLICY.critical, callEligible: score >= POLICY.call && views >= POLICY.callMinViews && h >= POLICY.callMinHoursLeft };
}

// ---- words ---------------------------------------------------------------------
const W: Record<Lang, { nudge: (d: string, h: number, shown: string, p: string) => string; spoken: (d: string, shown: string, p: string) => string; call: (name: string, d: string, shown: string, p: string) => string; yes: string; done: string; no: string; bye: string }> = {
  en: { nudge: (d, h, s, p) => `⏰ ${d} starts in about ${Math.max(1, Math.round(h))} hours and Google still shows ${s}. We suggest ${p}.`, spoken: (d, s, p) => `Reminder: on ${d} Google still shows ${s}. We suggest ${p}. You can approve it in the chat.`, call: (n, d, s, p) => `Hello, this is an automated call from Fonecta Connect for ${n}. On ${d}, Google still shows ${s}. We suggest ${p}. Press 1 to approve, press 2 to leave it as it is.`, yes: "Thank you. The change is approved and being applied.", done: "Understood. We leave it as it is.", no: "We did not get an answer. We will send a message instead.", bye: "Goodbye." },
  fi: { nudge: (d, h, s, p) => `⏰ ${d} alkaa noin ${Math.max(1, Math.round(h))} tunnin päästä ja Google näyttää yhä ${s}. Ehdotamme: ${p}.`, spoken: (d, s, p) => `Muistutus: ${d} Google näyttää yhä ${s}. Ehdotamme: ${p}. Voit hyväksyä sen keskustelussa.`, call: (n, d, s, p) => `Hei, tämä on automaattinen puhelu Fonecta Connectilta yritykselle ${n}. Päivälle ${d} Google näyttää yhä ${s}. Ehdotamme: ${p}. Paina 1 hyväksyäksesi tai 2 jättääksesi ennalleen.`, yes: "Kiitos. Muutos on hyväksytty ja otetaan käyttöön.", done: "Selvä. Jätämme sen ennalleen.", no: "Emme saaneet vastausta. Lähetämme sen sijaan viestin.", bye: "Näkemiin." },
  sv: { nudge: (d, h, s, p) => `⏰ ${d} börjar om cirka ${Math.max(1, Math.round(h))} timmar och Google visar fortfarande ${s}. Vi föreslår ${p}.`, spoken: (d, s, p) => `Påminnelse: ${d} visar Google fortfarande ${s}. Vi föreslår ${p}. Du kan godkänna i chatten.`, call: (n, d, s, p) => `Hej, det här är ett automatiskt samtal från Fonecta Connect för ${n}. För ${d} visar Google fortfarande ${s}. Vi föreslår ${p}. Tryck 1 för att godkänna eller 2 för att lämna som det är.`, yes: "Tack. Ändringen är godkänd och genomförs.", done: "Uppfattat. Vi lämnar det som det är.", no: "Vi fick inget svar. Vi skickar ett meddelande i stället.", bye: "Hej då." },
  nb: { nudge: (d, h, s, p) => `⏰ ${d} starter om omtrent ${Math.max(1, Math.round(h))} timer, og Google viser fortsatt ${s}. Vi foreslår ${p}.`, spoken: (d, s, p) => `Påminnelse: ${d} viser Google fortsatt ${s}. Vi foreslår ${p}. Du kan godkjenne i chatten.`, call: (n, d, s, p) => `Hei, dette er en automatisk samtale fra Fonecta Connect for ${n}. For ${d} viser Google fortsatt ${s}. Vi foreslår ${p}. Trykk 1 for å godkjenne eller 2 for å la det være.`, yes: "Takk. Endringen er godkjent og settes i gang.", done: "Forstått. Vi lar det være som det er.", no: "Vi fikk ikke svar. Vi sender en melding i stedet.", bye: "Ha det." },
};
export const callWords = (l: Lang) => W[l];
const LOCALE: Record<Lang, string> = { fi: "fi-FI", sv: "sv-SE", nb: "nb-NO", en: "en-GB" };
export const sayLang = (l: Lang) => LOCALE[l];

// ---- the ladder ----------------------------------------------------------------
const done = (db: DB, businessId: string, refId: string) => db.select().from(schema.cnAlerts).where(and(eq(schema.cnAlerts.businessId, businessId), eq(schema.cnAlerts.refId, refId))).all();
const record = (db: DB, biz: Biz, scenario: string, refId: string, step: string, outcome: "sent" | "skipped" | "failed", detail?: Record<string, unknown>) =>
  db.insert(schema.cnAlerts).values({ id: newId(), businessId: biz.id, scenario, refId, step, outcome, detailJson: detail ?? null, createdAt: now() }).run();

export interface LadderResult { sugId: string; date: string; step: Step; outcome: "sent" | "skipped" | "failed"; why?: string }

/** The next step for one critical suggestion and whether it is due. Pure, so the policy is testable. */
export function nextStep(a: Assessment, status: string, sentAt: number | null, past: { step: string; outcome: string; createdAt: number }[], nowMs: number, tz: string, opt: { callsToday: number; demo?: boolean; canCall: boolean }): { step: Step; due: boolean; why?: string } | null {
  if (!a.critical) return null;
  if (status === "draft") return { step: "contact", due: true };
  const taken = new Set(past.map((p) => p.step)), hoursSince = (t: number) => (nowMs - t) / 3.6e6;
  const step = LADDER.find((x) => !taken.has(x));
  if (!step) return null;
  const last = [...past].sort((x, y) => y.createdAt - x.createdAt)[0]?.createdAt ?? sentAt ?? nowMs;
  const wait = step === "nudge" ? POLICY.nudgeAfterH : step === "voice" ? POLICY.voiceAfterH : POLICY.callAfterH;
  if (!opt.demo && hoursSince(last) < wait) return { step, due: false, why: `waiting ${wait} h after the previous step` };
  if (step === "call") {
    if (!a.callEligible) return { step, due: false, why: `not eligible for a call (score ${a.score}, ${a.views} views, ${a.hoursUntil} h left)` };
    if (opt.callsToday >= 1) return { step, due: false, why: "one call per 24 h" };
    if (!opt.canCall) return { step, due: true, why: "no telephony configured" };
    if (!opt.demo && inQuietHours(tz, nowMs)) return { step, due: false, why: "quiet hours (before 08:00 / after 20:00)" };
  }
  return { step, due: true };
}

async function doNudge(db: DB, biz: Biz, s: Sug, a: Assessment): Promise<{ outcome: "sent" | "skipped"; why?: string }> {
  const l = asLang(biz.language), w = W[l], text = w.nudge(fmtDate(s.date, l), a.hoursUntil, fmtHours(s.shown, l), fmtHours(s.proposed, l));
  let sent = false;
  if (biz.telegramChatId && hasTelegram()) { await say(biz.telegramChatId, text, { reply_markup: { inline_keyboard: [[{ text: `✅ ${T[l].approve}`, callback_data: `a:${s.id}` }, { text: `✖️ ${T[l].decline}`, callback_data: `n:${s.id}` }]] } }); sent = true; }
  if (demoPhone() && hasSms()) {
    const link = s.messageId ? (await db.select().from(schema.cnMessages).where(eq(schema.cnMessages.id, s.messageId)).get())?.token : null;
    await sendSms(demoPhone()!, `${biz.name}: ${text.replace("⏰ ", "")}${link ? `\n${appUrl()}/d/${link}` : ""}`); sent = true;
  }
  if (demoPhone() && hasWhatsapp()) {
    const link = s.messageId ? (await db.select().from(schema.cnMessages).where(eq(schema.cnMessages.id, s.messageId)).get())?.token : null;
    await sendWhatsapp(demoPhone()!, `${text.replace("⏰ ", "⏰ ")}${link ? `\n${appUrl()}/d/${link}` : ""}\n${T[l].smsOk("1")}`); sent = true;
  }
  return sent ? { outcome: "sent" } : { outcome: "skipped", why: "no channel linked" };
}
async function doVoice(biz: Biz, s: Sug): Promise<{ outcome: "sent" | "skipped"; why?: string }> {
  const l = asLang(biz.language);
  if (!biz.telegramChatId || !hasTelegram() || !hasVoice()) return { outcome: "skipped", why: "no Telegram chat or voice key" };
  const audio = await speak(W[l].spoken(fmtDate(s.date, l), fmtHours(s.shown, l), fmtHours(s.proposed, l)));
  if (!audio) return { outcome: "skipped", why: "voice synthesis failed" };
  await sendVoice(biz.telegramChatId, audio, "🔊 AI voice");
  return { outcome: "sent" };
}
async function doCall(biz: Biz, s: Sug): Promise<{ outcome: "sent" | "skipped"; why?: string; callSid?: string }> {
  const to = demoPhone();                 // demo safety: calls only ever go to the demo number, never to numbers in the data
  if (!hasCalls() || !to) return { outcome: "skipped", why: "no telephony account (46elks or Twilio) or demo number configured" };
  const r = await dial(to, { id: s.id, token: s.token });
  return { outcome: "sent", callSid: `${r.provider}:${r.id}` };
}

/** Runs at most one due step per business. `demo` ignores waiting times and quiet hours (never opt-outs, rules or call eligibility); `asOf` is the clock. */
export async function runLadder(db: DB, businessId: string, opt: { asOf?: number; demo?: boolean } = {}): Promise<LadderResult[]> {
  const biz = await getBiz(db, businessId), at = opt.asOf ?? now();
  if (!biz || biz.optedOut) return [];
  const tz = TZ[biz.country] ?? "Europe/Helsinki", out: LadderResult[] = [];
  const rules = (await loadRules(db, biz.id)).map((r) => r.rule);
  const callsToday = (await db.select().from(schema.cnAlerts).where(and(eq(schema.cnAlerts.businessId, biz.id), eq(schema.cnAlerts.step, "call"), eq(schema.cnAlerts.outcome, "sent"), gte(schema.cnAlerts.createdAt, now() - 86400_000))).all()).length;
  const sugs = (await sugsFor(db, biz.id)).filter((s) => s.action === "SUGGEST" && ["draft", "sent"].includes(s.status));
  for (const s of sugs) {
    const a = assess(s, biz.country, at);
    if (!a || (s.proposed && dateViolation(rules, s.date, toPlan(s.proposed)))) continue;   // the owner's rules also stop alerts about changes they forbade
    const n = nextStep(a, s.status, s.sentAt, await done(db, biz.id, s.id), at, tz, { callsToday, demo: opt.demo, canCall: hasCalls() && !!demoPhone() });
    if (!n || !n.due) continue;
    try {
      let r: { outcome: "sent" | "skipped" | "failed"; why?: string; callSid?: string };
      if (n.step === "contact") { const c = await sendNow(db, biz.id); r = c.ok && c.sent ? { outcome: "sent" } : { outcome: "skipped", why: "nothing to send" }; }
      else if (n.step === "nudge") r = await doNudge(db, biz, s, a);
      else if (n.step === "voice") r = await doVoice(biz, s);
      else r = n.why === "no telephony configured" ? { outcome: "skipped", why: n.why } : await doCall(biz, s);
      if (n.step !== "contact") await record(db, biz, a.scenario, s.id, n.step, r.outcome, { score: a.score, hoursUntil: a.hoursUntil, why: r.why, callSid: r.callSid, demo: !!opt.demo });
      await log(db, biz.id, `alert_${n.step}`, { date: s.date, outcome: r.outcome, why: r.why, score: a.score }, s.id);
      out.push({ sugId: s.id, date: s.date, step: n.step, outcome: r.outcome, why: r.why });
    } catch (e) {
      if (n.step !== "contact") await record(db, biz, a.scenario, s.id, n.step, "failed", { error: String(e) });
      out.push({ sugId: s.id, date: s.date, step: n.step, outcome: "failed", why: String(e) });
    }
    break;   // one step per business per run
  }
  return out;
}

/** Cron: businesses with a decision waiting for a day inside the horizon. */
export async function runDueAlerts(db: DB, cap = 20) {
  const nowMs = now(), day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const rows = await db.select({ b: schema.cnSuggestions.businessId }).from(schema.cnSuggestions).where(and(eq(schema.cnSuggestions.action, "SUGGEST"), inArray(schema.cnSuggestions.status, ["draft", "sent"]), gte(schema.cnSuggestions.date, day(nowMs - 86400_000)), lte(schema.cnSuggestions.date, day(nowMs + 4 * 86400_000)))).all();
  const ids = [...new Set(rows.map((r) => r.b))].slice(0, cap), res: LadderResult[] = [];
  for (const id of ids) res.push(...(await runLadder(db, id)));
  return res;
}
