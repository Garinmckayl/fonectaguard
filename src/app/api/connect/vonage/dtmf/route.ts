import { getDb } from "@/lib/db";
import { decide, getBiz, getSug, log } from "@/lib/connect/service";
import { audioUrl } from "@/lib/connect/calls";

const ncco = (o: unknown[]) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });

/** The key the owner pressed. 1 = approve, 2 = leave as it is, anything else or silence = nothing is applied (we send a message instead). */
export async function POST(req: Request) {
  const u = new URL(req.url), body = (await req.json().catch(() => ({}))) as { dtmf?: string | { digits?: string; timed_out?: boolean } };
  const digit = typeof body.dtmf === "string" ? body.dtmf : body.dtmf?.digits ?? "";
  try {
    const db = await getDb(), s = await getSug(db, u.searchParams.get("s") ?? "");
    if (!s || s.token !== u.searchParams.get("k") || !s.proposed) return ncco([]);
    const biz = (await getBiz(db, s.businessId))!, me = { id: s.id, token: s.token }, say = (t: string) => ncco([{ action: "stream", streamUrl: [audioUrl(me, t)] }]);
    if (biz.optedOut) return ncco([]);
    if (digit === "1") { const r = await decide(db, s.id, { action: "approve" }); await log(db, biz.id, "call_decision", { digit, ok: r.ok }, s.id); return say(r.ok ? "yes" : "no"); }
    if (digit === "2") { await decide(db, s.id, { action: "keep" }); await log(db, biz.id, "call_decision", { digit }, s.id); return say("done"); }
    await log(db, biz.id, "call_decision", { digit: digit || "none" }, s.id);
    return say("no");
  } catch (e) { console.error("vonage dtmf", e); return ncco([]); }
}
