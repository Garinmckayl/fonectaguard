"use client";
import { useState } from "react";
import { Check, Pencil, X, Undo2, Loader2 } from "lucide-react";

export interface BoardItem { id: string; when: string; shows: string; suggest: string; why: string[]; status: string; proposed: string | null; finalText?: string; choices?: string[]; cost?: string | null }
export interface Labels { approve: string; edit: string; decline: string; approveAll: string; undo: string; whereShows: string; savedIn: string; editPrompt: string; save: string; cancel: string; declined: string; undone: string; alreadyDone: string; because: string; kept: string; whyMatters: string }
type Shows = { name: string; text: string; live: boolean }[];

/** One tap, no login: approve, edit in plain words, or decline each day. Results show where the change will appear. */
export function DecideBoard({ token, items, labels }: { token: string; items: BoardItem[]; labels: Labels }) {
  const [state, setState] = useState<Record<string, { status: string; text?: string; shows?: Shows; proposed?: string | null; err?: string }>>(Object.fromEntries(items.map((i) => [i.id, { status: i.status, proposed: i.proposed }])));
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [txt, setTxt] = useState("");

  async function act(id: string, action: "approve" | "decline" | "edit" | "undo" | "choose", text?: string, option?: number) {
    setBusy(id);
    try {
      const r = await fetch("/api/connect/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, suggestionId: id, action, text, option }) }).then((x) => x.json() as Promise<{ ok: boolean; text?: string; status?: string; proposed?: string | null; shows?: Shows; needsRetry?: boolean; adjusted?: { id: string; proposed: string | null }[] }>);
      if (r.needsRetry) { setState((s) => ({ ...s, [id]: { ...s[id], err: r.text } })); return; }
      setState((s) => {
        const next = { ...s, [id]: { status: r.status ?? s[id].status, text: r.text, shows: r.shows, proposed: r.proposed ?? s[id].proposed } };
        for (const a of r.adjusted ?? []) if (next[a.id]) next[a.id] = { ...next[a.id], proposed: a.proposed };
        return next;
      });
      setEditing(null); setTxt("");
    } finally { setBusy(null); }
  }
  const pending = items.filter((i) => !i.choices && ["sent", "draft"].includes(state[i.id].status));

  return (
    <div className="space-y-4">
      {items.map((it) => {
        const st = state[it.id], open = ["sent", "draft"].includes(st.status), done = ["applied", "auto_applied"].includes(st.status);
        return (
          <section key={it.id} className="card-pop fade-in">
            <h2 className="font-display text-xl font-bold capitalize text-ink">{it.when}</h2>
            <p className="mt-1 text-sm text-slate-500">{it.shows}</p>
            <p className={`mt-2 font-display font-extrabold text-ink ${it.choices ? "text-2xl" : "text-3xl"}`}>{it.suggest}</p>
            {open && <ul className="mt-3 space-y-1 text-sm text-slate-600">{it.why.map((w) => <li key={w}><span className="font-semibold text-ink">{labels.because}:</span> {w}</li>)}</ul>}
            {open && it.cost && <p className="mt-3 border-l-[3px] border-brand-deep bg-[#fff1e6] px-3 py-2 text-sm text-ink"><span className="font-semibold">{labels.whyMatters}:</span> {it.cost}</p>}
            {open && it.choices && (
              <div className="mt-4 grid gap-2">
                {it.choices.map((c, i) => <button key={c} className={`btn h-12 justify-start text-base ${i === 0 ? "btn-primary" : "btn-ghost"}`} disabled={busy === it.id} onClick={() => act(it.id, "choose", undefined, i)}>{busy === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="font-bold">{"ABCDEFGH"[i]})</span>} {c}</button>)}
              </div>
            )}
            {open && !it.choices && editing !== it.id && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn btn-primary h-12 flex-1 text-base" disabled={busy === it.id} onClick={() => act(it.id, "approve")}>{busy === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={3} />} {labels.approve}</button>
                <button className="btn btn-ghost h-12" onClick={() => { setEditing(it.id); setTxt(""); }}><Pencil className="h-4 w-4" /> {labels.edit}</button>
                <button className="btn btn-ghost h-12" disabled={busy === it.id} onClick={() => act(it.id, "decline")}><X className="h-4 w-4" /> {labels.decline}</button>
              </div>
            )}
            {open && editing === it.id && (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-slate-600">{labels.editPrompt}</p>
                <input className="input !text-base" autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="10-15" onKeyDown={(e) => e.key === "Enter" && txt && act(it.id, "edit", txt)} />
                {st.err && <p role="alert" className="text-sm font-medium text-red-700">{st.err}</p>}
                <div className="flex gap-2"><button className="btn btn-primary" disabled={!txt || busy === it.id} onClick={() => act(it.id, "edit", txt)}>{labels.save}</button><button className="btn btn-ghost" onClick={() => setEditing(null)}>{labels.cancel}</button></div>
              </div>
            )}
            {done && (
              <div className="mt-4 rounded-xl border-[1.5px] border-[#0A5C3B] bg-[#D5F3E3] p-4 text-sm text-[#0A3D2A]" role="status">
                <p className="font-display text-lg font-bold">✅ {st.text}</p>
                <p className="mt-1">{labels.savedIn}</p>
                {st.shows && <><p className="mt-3 font-semibold">{labels.whereShows}</p><ul className="mt-1 space-y-0.5">{st.shows.slice(0, 7).map((s) => <li key={s.name}>{s.live ? "•" : "◦"} {s.text}</li>)}</ul></>}
                <button className="btn btn-ghost mt-3 !py-1.5 text-xs" onClick={() => act(it.id, "undo")}><Undo2 className="h-3.5 w-3.5" /> {labels.undo}</button>
              </div>
            )}
            {st.status === "kept" && <p className="mt-4 rounded-xl border-[1.5px] border-ink bg-slate-100 p-3 text-sm">{labels.kept}</p>}
            {st.status === "declined" && <p className="mt-4 rounded-xl border-[1.5px] border-ink bg-slate-100 p-3 text-sm">{labels.declined}</p>}
            {st.status === "undone" && <p className="mt-4 rounded-xl border-[1.5px] border-ink bg-slate-100 p-3 text-sm">{labels.undone}</p>}
          </section>
        );
      })}
      {pending.length > 1 && <button className="btn btn-primary h-14 w-full text-lg" disabled={!!busy} onClick={async () => { for (const p of pending) await act(p.id, "approve"); }}><Check className="h-5 w-5" strokeWidth={3} /> {labels.approveAll} ({pending.length})</button>}
    </div>
  );
}
