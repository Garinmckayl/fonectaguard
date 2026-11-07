import { demoPhone, hasCalls as twilioCalls, placeCall as twilioCall } from "./sms";
import { appUrl } from "./service";

/**
 * Outbound phone calls through whichever telephony account is configured.
 *  46elks (ELKS_USERNAME, ELKS_PASSWORD, ELKS_FROM): the call plays ElevenLabs speech and reads one keypress.
 *  Twilio (TWILIO_*): TwiML with the phone's built-in voice.
 * Calls only ever go to DEMO_PHONE, never to numbers in the data.
 */
export const hasElks = () => !!(process.env.ELKS_USERNAME && process.env.ELKS_PASSWORD && process.env.ELKS_FROM);
export const hasVonage = () => !!(process.env.VONAGE_APP_ID && process.env.VONAGE_PRIVATE_KEY && process.env.VONAGE_FROM);
export const hasCalls = () => hasElks() || hasVonage() || twilioCalls();
export const callProvider = () => (hasElks() ? "46elks" : hasVonage() ? "vonage" : twilioCalls() ? "twilio" : null);

const b64u = (x: ArrayBuffer | string) => Buffer.from(typeof x === "string" ? x : new Uint8Array(x)).toString("base64url");
/** Vonage authenticates API calls with a short-lived RS256 JWT signed by the application's private key (PKCS8 PEM; "\n" allowed in the env value). */
export async function vonageJwt(appId: string, pem: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const der = Buffer.from(pem.replace(/\\n/g, "\n").replace(/-----[A-Z ]+-----|\s/g, ""), "base64");
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" })), body = b64u(JSON.stringify({ application_id: appId, iat: nowSec, jti: crypto.randomUUID(), exp: nowSec + 300 }));
  return `${head}.${body}.${b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`)))}`;
}
const digits = (n: string) => n.replace(/[^\d]/g, "");
export { demoPhone };

const cap = (path: string, s: { id: string; token: string }, extra = "") => `${appUrl()}${path}?s=${encodeURIComponent(s.id)}&k=${encodeURIComponent(s.token)}${extra}`;

export async function dial(to: string, s: { id: string; token: string }): Promise<{ provider: string; id: string }> {
  if (hasElks()) {
    const res = await fetch("https://api.46elks.com/a1/calls", {
      method: "POST", headers: { authorization: `Basic ${Buffer.from(`${process.env.ELKS_USERNAME}:${process.env.ELKS_PASSWORD}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ from: process.env.ELKS_FROM!, to, voice_start: cap("/api/connect/elks/voice", s, "&step=start"), timeout: "30" }), signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    if (!res.ok) throw new Error(`46elks call: ${res.status}`);
    return { provider: "46elks", id: j.id ?? "" };
  }
  if (hasVonage()) {
    const jwt = await vonageJwt(process.env.VONAGE_APP_ID!, process.env.VONAGE_PRIVATE_KEY!);
    const res = await fetch("https://api.nexmo.com/v1/calls", {
      method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ to: [{ type: "phone", number: digits(to) }], from: { type: "phone", number: digits(process.env.VONAGE_FROM!) }, answer_url: [cap("/api/connect/vonage/answer", s)], answer_method: "POST", ringing_timer: 30 }), signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => ({}))) as { uuid?: string; title?: string; detail?: string };
    if (!res.ok) throw new Error(`Vonage call: ${j.title ?? res.status}${j.detail ? ` (${j.detail})` : ""}`);
    return { provider: "vonage", id: j.uuid ?? "" };
  }
  return { provider: "twilio", id: await twilioCall(to, cap("/api/connect/voice", s)) };
}
export const audioUrl = (s: { id: string; token: string }, t: string) => cap("/api/connect/elks/audio", s, `&t=${t}`);
