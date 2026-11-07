import { getDb } from "@/lib/db";
import { getBiz, getSug } from "@/lib/connect/service";
import { callWords } from "@/lib/connect/critical";
import { asLang, fmtDate, fmtHours } from "@/lib/connect/i18n";
import { speak } from "@/lib/connect/elevenlabs";

/** The speech a call plays, made on demand by ElevenLabs (mp3, the owner's language). Same capability as the call itself. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  try {
    const db = await getDb(), s = await getSug(db, u.searchParams.get("s") ?? "");
    if (!s || s.token !== u.searchParams.get("k") || !s.proposed) return new Response("not found", { status: 404 });
    const biz = (await getBiz(db, s.businessId))!, l = asLang(biz.language), w = callWords(l), t = u.searchParams.get("t");
    const text = t === "ask" ? w.call(biz.name, fmtDate(s.date, l), fmtHours(s.shown, l), fmtHours(s.proposed, l)) : t === "yes" ? `${w.yes} ${w.bye}` : t === "done" ? `${w.done} ${w.bye}` : t === "no" ? `${w.no} ${w.bye}` : null;
    if (!text) return new Response("not found", { status: 404 });
    const audio = await speak(text, "mp3_44100_64");
    return audio ? new Response(audio as BodyInit, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=600" } }) : new Response("voice unavailable", { status: 503 });
  } catch (e) { console.error("elks audio", e); return new Response("error", { status: 500 }); }
}
