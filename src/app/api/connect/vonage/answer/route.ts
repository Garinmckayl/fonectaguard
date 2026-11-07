import { getDb } from "@/lib/db";
import { getBiz, getSug, log } from "@/lib/connect/service";
import { audioUrl } from "@/lib/connect/calls";

const ncco = (o: unknown[]) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });

/** Vonage asks what to do when the owner picks up. The suggestion id plus its private token are the capability. Plays the question (ElevenLabs speech) and waits for one key. */
async function handle(req: Request) {
  const u = new URL(req.url);
  try {
    const db = await getDb(), s = await getSug(db, u.searchParams.get("s") ?? "");
    if (!s || s.token !== u.searchParams.get("k") || !s.proposed) return ncco([]);
    const biz = (await getBiz(db, s.businessId))!;
    if (biz.optedOut) return ncco([]);
    await log(db, biz.id, "call_answered", { date: s.date, via: "vonage" }, s.id);
    return ncco([
      { action: "stream", streamUrl: [audioUrl({ id: s.id, token: s.token }, "ask")] },
      { action: "input", type: ["dtmf"], dtmf: { maxDigits: 1, timeOut: 8 }, eventUrl: [`${u.origin}/api/connect/vonage/dtmf?s=${encodeURIComponent(s.id)}&k=${encodeURIComponent(s.token)}`], eventMethod: "POST" },
    ]);
  } catch (e) { console.error("vonage answer", e); return ncco([]); }
}
export const GET = handle, POST = handle;
