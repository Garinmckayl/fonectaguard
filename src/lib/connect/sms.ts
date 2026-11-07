import crypto from "crypto";

/** Twilio over plain REST (works on Workers): no SDK. */
export const hasSms = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
/** Demo safety: like DEMO_EMAIL, texts only ever go to this number, never to the (fake) numbers in the data. */
export const demoPhone = () => process.env.DEMO_PHONE;

export async function sendSms(to: string, body: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!, auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body.slice(0, 1500) }), signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio: ${j.message ?? res.status}`);
  return j.sid ?? "";
}

/** Outbound phone call: Twilio fetches TwiML from `url` when the owner picks up. Same account keys as SMS; the number must be voice-capable. */
export const hasCalls = hasSms;
export async function placeCall(to: string, url: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!, auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Url: url, Timeout: "25" }), signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio call: ${j.message ?? res.status}`);
  return j.sid ?? "";
}
export const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** X-Twilio-Signature: base64 HMAC-SHA1 over the full URL followed by each POST param (sorted by name) as name+value. */
export function twilioSignature(url: string, params: Record<string, string>, token = process.env.TWILIO_AUTH_TOKEN ?? "") {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", token).update(data, "utf8").digest("base64");
}
export function validTwilio(url: string, params: Record<string, string>, sig: string | null) {
  if (!sig || !process.env.TWILIO_AUTH_TOKEN) return false;
  const a = Buffer.from(twilioSignature(url, params)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const twiml = (text?: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Message>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>` : ""}</Response>`;

/**
 * What an owner can text back, in fi/sv/nb/en. Day numbers are the numbers in our last text.
 *   OK / JOO / KYLLÄ / JA / YES      approve every day that isn't a question
 *   2                               approve day 2
 *   2B                              pick option B of day 2 (the last letter keeps what Google shows)
 *   2 10-15 / 2 closed              set day 2 to these hours
 *   NO 2 / EI 2 / NEJ 2 / NEI 2     skip day 2 (without a number: skip all)
 *   UNDO 2 / KUMOA 2 / ÅNGRA 2 / ANGRE 2   (UNDO A1: day 1 of the last autopilot notice)
 *   STOP / LOPETA / SLUTA           no more texts
 */
export type SmsCmd =
  | { k: "all" } | { k: "approve"; n: number } | { k: "choose"; n: number; opt: number } | { k: "edit"; n: number; text: string }
  | { k: "decline"; n: number | null } | { k: "undo"; n: number } | { k: "stop" } | { k: "help" };

export function parseSms(raw: string): SmsCmd {
  const s = raw.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  const u = s.toUpperCase();
  if (/^(STOP|LOPETA|SLUTA|STOPP|UNSUBSCRIBE)$/.test(u)) return { k: "stop" };
  if (/^(OK|OKAY|JOO|KYLLÄ|KYLLA|JEP|JA|YES|Y|👍)$/.test(u)) return { k: "all" };
  let m = u.match(/^(?:NO|EI|NEJ|NEI|N)(?: (\d{1,2}))?$/);
  if (m) return { k: "decline", n: m[1] ? Number(m[1]) : null };
  m = u.match(/^(?:UNDO|KUMOA|ÅNGRA|ANGRA|ANGRE)(?: A?(\d{1,2}))?$/);
  if (m) return { k: "undo", n: m[1] ? Number(m[1]) : 1 };
  m = u.match(/^(\d{1,2}) ?([A-H])$/);
  if (m) return { k: "choose", n: Number(m[1]), opt: m[2].charCodeAt(0) - 65 };
  m = u.match(/^(\d{1,2})(?: (?:OK|JOO|JA|YES))?$/);
  if (m) return { k: "approve", n: Number(m[1]) };
  m = s.match(/^(\d{1,2})[:)]? (.+)$/);
  if (m) return { k: "edit", n: Number(m[1]), text: m[2] };
  return { k: "help" };
}
