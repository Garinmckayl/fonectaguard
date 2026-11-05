"use client";
import { useRef, useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";
import { post } from "./actions";

type Msg = { role: "user" | "assistant"; content: string };
const SUGGEST = ["What's wrong with my listings?", "What should I fix first?", "Is my business info consistent online?"];

/** AI assistant (OpenRouter) grounded in this workspace's monitoring data. Read-only: it cannot change anything. */
export function Chat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function send(t: string) {
    if (!t.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: t.trim() }];
    setMsgs(next); setText(""); setBusy(true);
    try {
      const r = (await post("/api/chat", { messages: next })) as { reply: string };
      setMsgs([...next, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `Sorry, I couldn't answer: ${e instanceof Error ? e.message : "error"}` }]);
    } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50); }
  }

  return (
    <>
      {!open && <button onClick={() => setOpen(true)} aria-label="Ask the assistant" className="btn btn-primary fixed bottom-5 right-5 z-40 h-12 rounded-full px-5"><Bot className="h-5 w-5" /> Ask AI</button>}
      {open && (
        <div className="fade-in fixed bottom-5 right-5 z-40 flex h-[32rem] max-h-[85vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl shadow-indigo-500/20">
          <div className="flex items-center justify-between bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-3 text-white">
            <span className="flex items-center gap-2 text-sm font-medium"><Bot className="h-4 w-4" /> FonectaGuard assistant</span>
            <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
            {!msgs.length && (
              <div className="space-y-2">
                <p className="text-slate-500">Ask about your listings, issues or what to approve. I only use your monitoring data.</p>
                {SUGGEST.map((s) => <button key={s} onClick={() => send(s)} className="block w-full rounded-xl border border-line px-3 py-2 text-left text-slate-700 hover:bg-slate-50">{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => <div key={i} className={m.role === "user" ? "ml-8 rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-2 text-white" : "mr-8 whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-slate-800"}>{m.content}</div>)}
            {busy && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> thinking…</div>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2 border-t border-line p-3">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything…" maxLength={1000} />
            <button className="btn btn-primary px-3" disabled={busy} aria-label="Send"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
    </>
  );
}
