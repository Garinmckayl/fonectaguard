import { and, desc, eq, like } from "drizzle-orm";
import { schema, type DB } from "../db";
import { now } from "../ids";
import { asLang, T } from "./i18n";
import { applyChange, handleOwnerInput, type Input } from "./agent";
import { enqueueAgentJob } from "./agent-jobs";
import { handleSms } from "./sms-bot";
import { parseSms } from "./sms";
import { sugsFor, whereItShows, getBiz, log, type Biz } from "./service";
import { sendWhatsapp, waKey } from "./whatsapp";
import { transcribe } from "./elevenlabs";

export interface WaInbound { from: string; type: string; text?: string; image?: { url?: string; caption?: string }; audio?: { url?: string } }

const YES = /^(yes|y|ok|okay|sure|apply|do it|joo|kyllä|kylla|jep|ota käyttöön|ja|jo|okei)$/i, NO = /^(no|n|cancel|stop that|ei|peruuta|nej|nei|avbryt|avbryt)$/i;
const PENDING_MS = 15 * 60_000;

/** The owner a WhatsApp number belongs to: whoever we last texted at it. */
export async function businessForKey(db: DB, key: string): Promise<Biz | null> {
  const m = await db.select().from(schema.cnMessages).where(like(schema.cnMessages.smsTo, `%${key}%`)).orderBy(desc(schema.cnMessages.createdAt)).limit(1).get();
  return m ? (await getBiz(db, m.businessId)) ?? null : null;
}

async function media(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { headers: { authorization: `Basic ${Buffer.from(`${process.env.VONAGE_API_KEY}:${process.env.VONAGE_API_SECRET}`).toString("base64")}` }, signal: AbortSignal.timeout(15_000) });
    return r.ok && Number(r.headers.get("content-length") ?? 0) < 8_000_000 ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { return null; }
}

/** Anything the owner sends on WhatsApp. Plain commands (OK, 2B, NO 1, UNDO) keep working; everything else goes to the same agent as Telegram. Changes it proposes wait for a YES. */
export async function handleWhatsapp(db: DB, m: WaInbound): Promise<void> {
  const key = waKey(m.from), biz = await businessForKey(db, key);
  const send = (t: string) => sendWhatsapp(m.from, t);
  if (!biz) { await send("Hi! This is Fonecta Connect. Open the invitation link from your business to connect this chat."); return; }
  const l = asLang(biz.language);
  let text = m.text?.trim() ?? "", image: Input["image"];
  if (m.type === "audio" && m.audio?.url) {
    const b = await media(m.audio.url), tr = b ? await transcribe(b, "audio/ogg") : null;
    if (!tr) { await send({ en: "I couldn't hear that clearly. Could you say it again, or type it?", fi: "En kuullut selvästi. Voitko sanoa uudelleen tai kirjoittaa sen?", sv: "Jag hörde inte tydligt. Kan du säga det igen eller skriva?", nb: "Jeg hørte ikke tydelig. Kan du si det igjen eller skrive det?" }[l]); return; }
    text = tr.text; await send(`🎤 “${tr.text}”`);
  }
  if (m.type === "image" && m.image?.url) {
    const b = await media(m.image.url);
    if (b) { image = { mime: "image/jpeg", b64: Buffer.from(b).toString("base64") }; text = m.image.caption?.trim() ?? ""; }
  }
  if (!text && !image) return;
  await log(db, biz.id, "whatsapp_in", { type: m.type, text: text.slice(0, 200), image: !!image });

  // 1. A change the agent proposed a moment ago is waiting for a yes or no.
  const proposed = (await db.select().from(schema.cnChanges).where(and(eq(schema.cnChanges.businessId, biz.id), eq(schema.cnChanges.status, "proposed"))).all()).filter((c) => now() - c.createdAt < PENDING_MS);
  if (proposed.length && !image && (YES.test(text) || NO.test(text))) {
    if (NO.test(text)) { for (const c of proposed) await db.update(schema.cnChanges).set({ status: "declined" }).where(eq(schema.cnChanges.id, c.id)).run(); await send({ en: "Cancelled, nothing changed.", fi: "Peruttu, mitään ei muutettu.", sv: "Avbrutet, inget ändrades.", nb: "Avbrutt, ingenting ble endret." }[l]); return; }
    const out: string[] = [];
    for (const c of proposed) { const r = await applyChange(db, biz, c); out.push(r.ok ? "✅" : `⚠️ ${r.error?.startsWith("rule:") ? r.error.slice(5) : T[l].failed}`); }
    const live = whereItShows(biz, l).filter((x) => x.live).slice(0, 3).map((x) => x.text).join(", ");
    await send(`${out.join(" ")} ${T[l].savedIn}${live ? `\n${T[l].whereShows}: ${live}.` : ""}`);
    return;
  }

  // 2. Short commands about the suggestions we sent (only when something is actually waiting).
  const cmd = parseSms(text), open = (await sugsFor(db, biz.id)).some((s) => s.status === "sent");
  if (!image && cmd.k !== "help" && (cmd.k !== "all" || open) && !(cmd.k === "approve" && !open)) { await send(await handleSms(db, key, text)); return; }

  // 3. Everything else is a conversation with the agent.
  const r = await handleOwnerInput(db, biz.id, { text: text || undefined, image, source: image ? "photo" : m.type === "audio" ? "voice" : "text" });
  await send(r.changes.length ? `${r.text}\n\n${{ en: "Reply YES to apply, NO to cancel.", fi: "Vastaa KYLLÄ ottaaksesi käyttöön tai EI peruaksesi.", sv: "Svara JA för att tillämpa eller NEJ för att avbryta.", nb: "Svar JA for å bruke eller NEI for å avbryte." }[l]}` : r.text);
  if (r.presence) await enqueueAgentJob(db, { type: "presence", businessId: biz.id, chatId: key, voice: false });
  if (r.site) await enqueueAgentJob(db, { type: "site", businessId: biz.id, chatId: key, voice: false, site: r.site });
}
