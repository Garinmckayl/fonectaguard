import { getDb } from "@/lib/db";
import { appUrl, decide, getBiz, getSug, log } from "@/lib/connect/service";
import { validTwilio, xml } from "@/lib/connect/sms";
import { callWords, sayLang } from "@/lib/connect/critical";
import { asLang, fmtDate, fmtHours } from "@/lib/connect/i18n";

const twiml = (body: string, status = 200) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { status, headers: { "content-type": "text/xml; charset=utf-8" } });

/**
 * The phone call the ladder places: Twilio asks this URL what to say. The suggestion id plus its private token are the capability
 * (nobody else can reach the decision), and Twilio's signature proves the request is from Twilio.
 * 1 = approve, 2 = leave as it is; anything else or silence = we send a message instead. Nothing is applied without a keypress.
 */
export async function POST(req: Request) {
  const u = new URL(req.url), params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  if (!validTwilio(`${appUrl()}${u.pathname}${u.search}`, params, req.headers.get("x-twilio-signature"))) return twiml("", 403);
  try {
    const db = await getDb(), s = await getSug(db, u.searchParams.get("s") ?? "");
    if (!s || s.token !== u.searchParams.get("k") || !s.proposed) return twiml("<Hangup/>");
    const biz = (await getBiz(db, s.businessId))!, l = asLang(biz.language), w = callWords(l), say = (t: string) => `<Say language="${sayLang(l)}" voice="alice">${xml(t)}</Say>`;
    if (biz.optedOut) return twiml("<Hangup/>");
    const digit = params.Digits;
    if (!digit) {
      await log(db, biz.id, "call_answered", { date: s.date }, s.id);
      return twiml(`<Gather numDigits="1" timeout="8" action="${xml(`${appUrl()}${u.pathname}${u.search}`)}">${say(w.call(biz.name, fmtDate(s.date, l), fmtHours(s.shown, l), fmtHours(s.proposed, l)))}</Gather>${say(w.no)}${say(w.bye)}`);
    }
    if (digit === "1") { const r = await decide(db, s.id, { action: "approve" }); await log(db, biz.id, "call_decision", { digit, ok: r.ok }, s.id); return twiml(`${say(r.ok ? w.yes : r.text)}${say(w.bye)}`); }
    if (digit === "2") { await decide(db, s.id, { action: "keep" }); await log(db, biz.id, "call_decision", { digit }, s.id); return twiml(`${say(w.done)}${say(w.bye)}`); }
    return twiml(`${say(w.no)}${say(w.bye)}`);
  } catch (e) { console.error("voice", e); return twiml("<Hangup/>"); }
}
