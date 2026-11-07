import { getDb } from "@/lib/db";
import { decide, getBiz, getSug, log } from "@/lib/connect/service";
import { audioUrl } from "@/lib/connect/calls";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const ELKS_IPS = new Set(["176.10.154.199", "85.24.146.132", "185.39.146.243", "2001:9b0:2:902::199"]);

/**
 * 46elks call webhook. The suggestion id plus its private token are the capability; when Cloudflare tells us the caller's IP it must also be one of 46elks' published addresses.
 * step=start: play the question (ElevenLabs speech) and wait for one key. step=digit: 1 = approve, 2 = leave as it is, anything else = we send a message instead.
 */
export async function POST(req: Request) {
  const u = new URL(req.url), ip = req.headers.get("cf-connecting-ip");
  if (ip && !ELKS_IPS.has(ip)) return json({ hangup: "reject" }, 403);
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  try {
    const db = await getDb(), s = await getSug(db, u.searchParams.get("s") ?? "");
    if (!s || s.token !== u.searchParams.get("k") || !s.proposed) return json({ hangup: "reject" });
    const biz = (await getBiz(db, s.businessId))!, me = { id: s.id, token: s.token };
    if (biz.optedOut) return json({ hangup: "reject" });
    if (u.searchParams.get("step") === "start") {
      await log(db, biz.id, "call_answered", { date: s.date, via: "46elks" }, s.id);
      return json({ ivr: audioUrl(me, "ask"), digits: 1, timeout: 10, repeat: 2, next: `${u.origin}${u.pathname}?s=${encodeURIComponent(s.id)}&k=${encodeURIComponent(s.token)}&step=digit` });
    }
    const digit = params.result;
    if (digit === "1") { const r = await decide(db, s.id, { action: "approve" }); await log(db, biz.id, "call_decision", { digit, ok: r.ok }, s.id); return json({ play: audioUrl(me, r.ok ? "yes" : "no") }); }
    if (digit === "2") { await decide(db, s.id, { action: "keep" }); await log(db, biz.id, "call_decision", { digit }, s.id); return json({ play: audioUrl(me, "done") }); }
    await log(db, biz.id, "call_decision", { digit: digit ?? "none", why: params.why }, s.id);
    return json({ play: audioUrl(me, "no") });
  } catch (e) { console.error("elks voice", e); return json({ hangup: "reject" }); }
}
