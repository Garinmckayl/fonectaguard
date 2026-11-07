"use client";
import { useState } from "react";
import { Camera, Loader2, Send } from "lucide-react";

type Change = { id: string; label: string };
type Turn = { me: string; reply: string; changes: Change[]; applied?: Record<string, "applied" | "failed" | "undone"> };

/** Talk to the agent from the console, with text or a photo. Same brain as the Telegram bot; changes still need a tap. */
export function AgentBox({ businessId }: { businessId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  async function call(body: Record<string, unknown>) {
    return (await fetch("/api/connect/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId, ...body }) }).then((r) => r.json())) as Record<string, unknown>;
  }
  async function send(image?: { mime: string; b64: string }) {
    if (!text.trim() && !image) return;
    const me = image ? `📷 ${text || "(photo)"}` : text;
    setBusy(true); setText("");
    try {
      const r = (await call({ action: "agent", text: text || undefined, image })) as { ok: boolean; text?: string; changes?: Change[]; presence?: boolean };
      let reply = r.text ?? "…";
      if (r.presence) { const p = (await call({ action: "presence" })) as { message?: string }; reply = p.message ?? reply; }
      setTurns((t) => [...t, { me, reply, changes: r.changes ?? [] }]);
    } finally { setBusy(false); }
  }
  async function act(i: number, c: Change, action: "agent_apply" | "agent_undo") {
    const r = (await call({ action, changeId: c.id })) as { ok?: boolean };
    setTurns((t) => t.map((x, j) => (j === i ? { ...x, applied: { ...x.applied, [c.id]: r.ok ? (action === "agent_apply" ? "applied" : "undone") : "failed" } } : x)));
  }
  function pick(f: File | undefined) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const m = String(rd.result).match(/^data:(.+?);base64,(.*)$/); if (m) void send({ mime: m[1], b64: m[2] }); };
    rd.readAsDataURL(f);
  }
  return (
    <div>
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {turns.length === 0 && <p className="text-sm text-slate-500">Try: “close us 24 Dec and open 12-16 on Boxing Day”, “change the phone to 040 555 0101”, “how is my online presence?”, or send a photo of a sign.</p>}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2 text-sm">
            <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm border-[1.5px] border-ink bg-ink px-3 py-2 text-paper">{t.me}</p>
            <p className="max-w-[95%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border-[1.5px] border-ink bg-white px-3 py-2 text-ink">{t.reply}</p>
            {t.changes.map((c) => { const st = t.applied?.[c.id]; return (
              <div key={c.id} className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-700">{c.label}</span>
                {!st && <button className="btn btn-primary !py-1 text-xs" onClick={() => act(i, c, "agent_apply")}>Apply</button>}
                {st === "applied" && <><span className="text-xs font-semibold text-emerald-700">✅ applied</span><button className="btn btn-ghost !py-1 text-xs" onClick={() => act(i, c, "agent_undo")}>Undo</button></>}
                {st === "undone" && <span className="text-xs text-slate-500">undone</span>}{st === "failed" && <span className="text-xs text-red-700">failed</span>}</div>); })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="input flex-1" placeholder="Tell the agent what to change, or ask a question…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && send()} disabled={busy} />
        <label className="btn btn-ghost cursor-pointer" title="Send a photo"><Camera className="h-4 w-4" /><input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} /></label>
        <button className="btn btn-primary" disabled={busy} onClick={() => send()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}
