import crypto from "crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { changes, getDb, schema } from "@/lib/db";
import { now } from "@/lib/ids";
import { handleWhatsapp } from "@/lib/connect/whatsapp-bot";
import { hasWhatsapp } from "@/lib/connect/whatsapp";

const ok = () => new Response("ok");
/** Vonage posts inbound WhatsApp messages here. The URL carries a secret (WA_WEBHOOK_KEY) so only Vonage, configured by us, can reach it. Replies reuse the SMS command language. */
export async function POST(req: Request) {
  const k = new URL(req.url).searchParams.get("k") ?? "", want = process.env.WA_WEBHOOK_KEY ?? "";
  if (!want || k.length !== want.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(want))) return new Response("forbidden", { status: 403 });
  try {
    const m = (await req.json()) as { message_uuid?: string; channel?: string; from?: string | { number?: string }; text?: string; message_type?: string; image?: { url?: string; caption?: string }; audio?: { url?: string } };
    const from = typeof m.from === "string" ? m.from : m.from?.number ?? "";
    if (m.channel !== "whatsapp" || !from || !hasWhatsapp()) return ok();
    const db = await getDb();
    // Vonage re-sends a webhook it thinks was too slow: one message is handled once.
    if (m.message_uuid) { const first = await db.insert(schema.rateLimits).values({ key: `wa:${m.message_uuid}`, windowStart: now(), count: 1 }).onConflictDoNothing().run(); if (changes(first) !== 1) return ok(); }
    // Answer Vonage at once; the work (Yext writes, the agent) continues in the background.
    const work = handleWhatsapp(db, { from, type: m.message_type ?? "text", text: m.text, image: m.image, audio: m.audio }).catch((e) => console.error("whatsapp work", e));
    let bg = false;
    try { getCloudflareContext().ctx.waitUntil(work); bg = true; } catch { /* local and tests: finish before answering */ }
    if (!bg) await work;
  } catch (e) { console.error("whatsapp inbound", e); }
  return ok();
}
